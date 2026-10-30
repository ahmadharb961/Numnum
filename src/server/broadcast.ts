import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { pushToUsers } from "./push";
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

/** Users in an audience who have notifications on (only they can receive a push). */
export async function audienceUserIds(a: Audience, target: { userId?: string; restaurantId?: string } = {}): Promise<string[]> {
  const withPush = { pushSubs: { some: {} } } satisfies Prisma.UserWhereInput;
  let users: { id: string }[];
  switch (a) {
    case "everyone":
      users = await prisma.user.findMany({ where: { ...withPush, disabled: false }, select: { id: true } });
      break;
    case "customers":
      users = await prisma.user.findMany({ where: { ...withPush, disabled: false, staff: { none: {} }, roles: { none: { role: "ADMIN" } } }, select: { id: true } });
      break;
    case "restaurants":
      users = await prisma.user.findMany({ where: { ...withPush, disabled: false, staff: { some: {} } }, select: { id: true } });
      break;
    case "user":
      users = target.userId ? await prisma.user.findMany({ where: { id: target.userId, ...withPush }, select: { id: true } }) : [];
      break;
    case "restaurant":
      users = target.restaurantId ? await prisma.user.findMany({ where: { ...withPush, disabled: false, staff: { some: { restaurantId: target.restaurantId } } }, select: { id: true } }) : [];
      break;
  }
  return users.map((u) => u.id);
}

/** People and devices with notifications on, per audience (shown next to the form). */
export async function audienceStats() {
  const out = {} as Record<"everyone" | "customers" | "restaurants", { people: number; devices: number }>;
  for (const a of ["everyone", "customers", "restaurants"] as const) {
    const ids = await audienceUserIds(a);
    out[a] = { people: ids.length, devices: ids.length ? await prisma.pushSubscription.count({ where: { userId: { in: ids } } }) : 0 };
  }
  return out;
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
  const ids = await audienceUserIds(d.audience, { userId, restaurantId: d.restaurantId });
  if (!ids.length) return { ok: false, error: d.audience === "user" || d.audience === "restaurant" ? "They haven't turned on notifications on any device yet." : "Nobody in this audience has turned on notifications yet." };
  const devices = await prisma.pushSubscription.count({ where: { userId: { in: ids } } });
  const row = await prisma.pushBroadcast.create({ data: { audience: d.audience, targetLabel, title: d.title || null, body: d.body || null, imageUrl: d.imageUrl || null, link: d.link || null, recipients: ids.length, devices, createdById: adminId } });
  const delivered = await pushToUsers(ids, { title: d.title || "numnum", body: d.body, url: d.link || "/", image: d.imageUrl ? absolute(d.imageUrl) : undefined, tag: `broadcast-${row.id}`, requireInteraction: true });
  await prisma.pushBroadcast.update({ where: { id: row.id }, data: { delivered } });
  await audit({ actorId: adminId, action: "push.broadcast", entityType: "push_broadcast", entityId: row.id, data: { audience: d.audience, targetLabel, people: ids.length, devices, delivered } });
  return { ok: true, people: ids.length, devices, delivered };
}

// Notification images must be absolute URLs.
const absolute = (u: string) => (u.startsWith("/") ? `${(process.env.APP_URL || "").replace(/\/$/, "")}${u}` : u);
