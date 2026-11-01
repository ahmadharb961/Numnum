import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { pushToDevices } from "./push";
import { audit } from "./audit";

export const AUDIENCES = ["everyone", "customers", "restaurants", "user", "restaurant"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  everyone: "Everyone",
  customers: "All customers",
  restaurants: "All restaurants",
  user: "One person",
  restaurant: "One restaurant",
};

// Internal paths ("/r/burger-house") or full https links.
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/[^\s]+$/.test(v), "Use a page path like /restaurants or a full https:// link");

export const broadcastSchema = z
  .object({
    audience: z.enum(AUDIENCES),
    email: z.string().trim().toLowerCase().max(200).optional(),
    restaurantId: z.string().max(40).optional(),
    title: z.string().trim().max(80).optional().default(""),
    body: z.string().trim().max(300).optional().default(""),
    imageUrl: link.optional().default(""),
    link: link.optional().default(""),
  })
  .refine((d) => d.title || d.body || d.imageUrl, { message: "Add a title, a message or a photo", path: ["title"] })
  .refine((d) => d.audience !== "user" || !!d.email, { message: "Enter the person's email", path: ["email"] })
  .refine((d) => d.audience !== "restaurant" || !!d.restaurantId, { message: "Choose a restaurant", path: ["restaurantId"] });

export type BroadcastInput = z.input<typeof broadcastSchema>;

/**
 * Devices in an audience (only devices with notifications on can receive a push).
 * Guests' devices (no account yet) count as customers.
 */
export function audienceDevices(a: Audience, target: { userId?: string; restaurantId?: string } = {}): Prisma.PushSubscriptionWhereInput {
  const active = { disabled: false };
  switch (a) {
    case "everyone":
      return { OR: [{ userId: null }, { user: active }] };
    case "customers":
      return { OR: [{ userId: null }, { user: { ...active, staff: { none: {} }, roles: { none: { role: "ADMIN" } } } }] };
    case "restaurants":
      return { user: { ...active, staff: { some: {} } } };
    case "user":
      return { userId: target.userId ?? "-" };
    case "restaurant":
      return { user: { ...active, staff: { some: { restaurantId: target.restaurantId ?? "-" } } } };
  }
}

/** People (accounts, plus each guest device) and devices reachable in an audience. */
export async function audienceReach(where: Prisma.PushSubscriptionWhereInput) {
  const [devices, accounts, guests] = await Promise.all([
    prisma.pushSubscription.count({ where }),
    prisma.pushSubscription.findMany({ where: { AND: [where, { userId: { not: null } }] }, distinct: ["userId"], select: { userId: true } }),
    prisma.pushSubscription.count({ where: { AND: [where, { userId: null }] } }),
  ]);
  return { people: accounts.length + guests, devices };
}

/** Reach per group audience (shown next to the form). */
export async function audienceStats() {
  const out = {} as Record<"everyone" | "customers" | "restaurants", { people: number; devices: number }>;
  for (const a of ["everyone", "customers", "restaurants"] as const) out[a] = await audienceReach(audienceDevices(a));
  return out;
}

export const messagePath = (broadcastId: string) => `/m/${broadcastId}`;

/** Who may open a broadcast's message page: its audience (and admins). */
export async function canSeeBroadcast(b: { audience: string; targetLabel: string | null }, broadcastId: string, user: { id: string; roles: string[] } | null) {
  if (user?.roles.includes("ADMIN")) return true;
  if (b.audience === "everyone" || b.audience === "customers") return true;
  if (!user) return false;
  if (b.audience === "restaurants") return (await prisma.restaurantStaff.count({ where: { userId: user.id } })) > 0;
  // one restaurant / one person: they received it (stored notification, or the push went to their devices)
  if (b.audience === "restaurant") {
    const staff = await prisma.restaurantStaff.findMany({ where: { userId: user.id }, select: { restaurantId: true } });
    return (await prisma.notification.count({ where: { link: messagePath(broadcastId), restaurantId: { in: staff.map((s) => s.restaurantId) } } })) > 0;
  }
  if (b.audience === "user") return (await prisma.auditLog.count({ where: { action: "push.broadcast", entityId: broadcastId, data: { path: ["targetUserId"], equals: user.id } } })) > 0;
  return false;
}

export type BroadcastResult = { ok: true; people: number; devices: number; delivered: number } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export async function sendBroadcast(raw: BroadcastInput, adminId: string): Promise<BroadcastResult> {
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "title")] ??= i.message;
    return { ok: false, fieldErrors };
  }
  const d = parsed.data;
  let targetLabel: string | null = null;
  let userId: string | undefined;
  if (d.audience === "user") {
    const u = await prisma.user.findUnique({ where: { email: d.email! }, select: { id: true, name: true, email: true } });
    if (!u) return { ok: false, fieldErrors: { email: "No account with this email" } };
    userId = u.id;
    targetLabel = `${u.name} (${u.email})`;
  }
  if (d.audience === "restaurant") {
    const r = await prisma.restaurant.findUnique({ where: { id: d.restaurantId! }, select: { displayName: true } });
    if (!r) return { ok: false, fieldErrors: { restaurantId: "Restaurant not found" } };
    targetLabel = r.displayName;
  }
  const where = audienceDevices(d.audience, { userId, restaurantId: d.restaurantId });
  const { people, devices } = await audienceReach(where);
  if (!devices) return { ok: false, error: d.audience === "user" || d.audience === "restaurant" ? "They haven't turned on notifications on any device yet." : "Nobody in this audience has turned on notifications yet." };
  const row = await prisma.pushBroadcast.create({ data: { audience: d.audience, targetLabel, title: d.title || null, body: d.body || null, imageUrl: d.imageUrl || null, link: d.link || null, recipients: people, devices, createdById: adminId } });
  // Tapping the notification opens the message page (title, text, full photo, and the link as a button).
  const page = messagePath(row.id);
  // Restaurants also keep it in their dashboard notifications.
  const restaurantIds =
    d.audience === "restaurant" ? [d.restaurantId!] : d.audience === "restaurants" || d.audience === "everyone" ? (await prisma.restaurant.findMany({ where: { staff: { some: {} } }, select: { id: true } })).map((r) => r.id) : [];
  if (restaurantIds.length)
    await prisma.notification.createMany({
      data: restaurantIds.map((restaurantId) => ({ audience: "RESTAURANT", restaurantId, type: "BROADCAST", title: d.title || "numnum", body: d.body || null, imageUrl: d.imageUrl || null, link: page })),
    });
  const delivered = await pushToDevices(where, { title: d.title || "numnum", body: d.body, url: page, image: d.imageUrl ? absolute(d.imageUrl) : undefined, tag: `broadcast-${row.id}`, requireInteraction: true });
  await prisma.pushBroadcast.update({ where: { id: row.id }, data: { delivered } });
  await audit({ actorId: adminId, action: "push.broadcast", entityType: "push_broadcast", entityId: row.id, data: { audience: d.audience, targetLabel, targetUserId: userId ?? null, people, devices, delivered } });
  return { ok: true, people, devices, delivered };
}

// Notification images must be absolute URLs.
const absolute = (u: string) => (u.startsWith("/") ? `${(process.env.APP_URL || "").replace(/\/$/, "")}${u}` : u);
