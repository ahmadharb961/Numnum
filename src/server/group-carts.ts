import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { MAX_LINES } from "./orders";

// Group ordering: the host shares a link, friends add their meals under their name, and the host
// places one order for everyone. Prices here are only for showing: the order is priced again on
// the server when the host places it.

export const GROUP_HOURS = 24;
export const MAX_MEMBERS = 15;
const MAX_MEMBER_LINES = 20;
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i: easy to read out

export class GroupError extends Error {
  /** Translated with its values by the API's error response ({ _: key + values }). */
  texts?: { _: { k: string; v: Record<string, string | number> } };
  constructor(
    message: string,
    public status = 400,
    values?: Record<string, string | number>,
  ) {
    super(message);
    if (values) this.texts = { _: { k: message, v: values } };
  }
}

export const groupLineSchema = z.object({
  menuItemId: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  imageUrl: z.string().max(800).nullable(),
  unitBaseCents: z.number().int().min(0).max(100_000_000),
  unitOptionsCents: z.number().int().min(-100_000_000).max(100_000_000),
  quantity: z.number().int().min(1).max(50),
  selections: z.record(z.string(), z.union([z.array(z.string().max(80)).max(40), z.string().max(80)])),
  summary: z.array(z.string().max(200)).max(40),
  note: z.string().max(200).nullable(),
  reelId: z.string().max(40).nullable(),
});
export type GroupLine = z.infer<typeof groupLineSchema>;
const linesSchema = z.array(groupLineSchema).max(MAX_MEMBER_LINES, "Too many different items");
const nameSchema = z.string().trim().min(1, "Enter your name").max(40, "Use a shorter name");

function newCode() {
  const b = randomBytes(8);
  return Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
}

type Viewer = { device: string; userId: string | null };

async function load(code: string) {
  const g = await prisma.groupCart.findUnique({
    where: { code: code.toLowerCase() },
    include: { restaurant: { select: { id: true, slug: true, displayName: true, currency: true, logoUrl: true, status: true } }, members: { orderBy: { createdAt: "asc" } } },
  });
  if (!g) throw new GroupError("This group order link isn't valid", 404);
  return g;
}

const isHostOf = (g: { hostDevice: string; hostUserId: string | null }, v: Viewer) => g.hostDevice === v.device || (!!v.userId && g.hostUserId === v.userId);
const live = (g: { status: string; expiresAt: Date }) => g.status === "OPEN" || g.status === "LOCKED" ? g.expiresAt > new Date() : false;

/** What everyone in the group sees: who's in, what each one picked, and where the order is. */
export async function groupState(code: string, v: Viewer) {
  const g = await load(code);
  const order = g.orderId ? await prisma.order.findUnique({ where: { id: g.orderId }, select: { reference: true, status: true } }) : null;
  const expired = (g.status === "OPEN" || g.status === "LOCKED") && g.expiresAt <= new Date();
  return {
    code: g.code,
    status: expired ? "EXPIRED" : g.status,
    restaurant: { id: g.restaurant.id, slug: g.restaurant.slug, name: g.restaurant.displayName, currency: g.restaurant.currency, logoUrl: g.restaurant.logoUrl },
    isHost: isHostOf(g, v),
    hostName: g.members.find((m) => m.isHost)?.name ?? "",
    members: g.members.map((m) => ({ id: m.id, name: m.name, isHost: m.isHost, isMe: m.deviceKey === v.device, lines: m.lines as GroupLine[] })),
    order: order && isHostOf(g, v) ? { reference: order.reference } : order ? { reference: null } : null,
    expiresAt: g.expiresAt.toISOString(),
  };
}
export type GroupState = Awaited<ReturnType<typeof groupState>>;

/** The host starts a group from their cart (their items come along). */
export async function createGroup(v: Viewer, input: { restaurantId: string; name: string; lines: unknown }) {
  const name = nameSchema.parse(input.name);
  const lines = linesSchema.parse(input.lines);
  const r = await prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: { status: true } });
  if (!r || r.status !== "ACTIVE") throw new GroupError("This restaurant isn't taking orders right now");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const g = await prisma.groupCart.create({
        data: {
          code: newCode(),
          restaurantId: input.restaurantId,
          hostUserId: v.userId,
          hostDevice: v.device,
          expiresAt: new Date(Date.now() + GROUP_HOURS * 3600_000),
          members: { create: { name, deviceKey: v.device, userId: v.userId, isHost: true, lines: lines as Prisma.InputJsonValue } },
        },
      });
      return g.code;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // a code already taken: try another
    }
  }
  throw new GroupError("Please try again");
}

/** A friend joins with their name (joining again from the same phone just updates the name). */
export async function joinGroup(code: string, v: Viewer, rawName: string) {
  const name = nameSchema.parse(rawName);
  const g = await load(code);
  if (!live(g)) throw new GroupError(g.status === "ORDERED" ? "This group order was already placed" : "This group order has ended", 410);
  const me = g.members.find((m) => m.deviceKey === v.device);
  if (me) {
    await prisma.groupCartMember.update({ where: { id: me.id }, data: { name, userId: v.userId ?? me.userId } });
    return;
  }
  if (g.status !== "OPEN") throw new GroupError("The host is placing the order now. Ask them to reopen it to add your meal.", 409);
  if (g.members.length >= MAX_MEMBERS) throw new GroupError("A group order can have up to {n} people", 400, { n: MAX_MEMBERS });
  await prisma.groupCartMember.create({ data: { groupCartId: g.id, name, deviceKey: v.device, userId: v.userId, lines: [] } });
}

/** A member's own items (sent as they change their cart). */
export async function setMyLines(code: string, v: Viewer, rawLines: unknown) {
  const lines = linesSchema.parse(rawLines);
  const g = await load(code);
  const me = g.members.find((m) => m.deviceKey === v.device);
  if (!me) throw new GroupError("Join the group first", 403);
  if (!live(g)) throw new GroupError("This group order has ended", 410);
  if (g.status !== "OPEN") throw new GroupError("The host is placing the order now. Your changes weren't added.", 409);
  if (lines.some((l) => !l.menuItemId)) throw new GroupError("Invalid item");
  await prisma.groupCartMember.update({ where: { id: me.id }, data: { lines: lines as Prisma.InputJsonValue } });
}

async function hostGroup(code: string, v: Viewer) {
  const g = await load(code);
  if (!isHostOf(g, v)) throw new GroupError("Only the person who started the group can do this", 403);
  return g;
}

/**
 * The host goes to checkout: nobody can change their items any more, and the host gets everyone's
 * items as one cart (a friend's items carry "For <name>" so the restaurant can pack per person).
 */
export async function lockGroup(code: string, v: Viewer) {
  const g = await hostGroup(code, v);
  if (!live(g)) throw new GroupError("This group order has ended", 410);
  const lines = g.members.flatMap((m) =>
    (m.lines as GroupLine[]).map((l) => ({ ...l, note: m.isHost ? l.note : [`For ${m.name}`, l.note].filter(Boolean).join(" · ").slice(0, 300) })),
  );
  if (!lines.length) throw new GroupError("Nobody has added anything yet");
  if (lines.length > MAX_LINES) throw new GroupError("One order can have up to {n} different items. Ask someone to remove a few.", 400, { n: MAX_LINES });
  await prisma.groupCart.update({ where: { id: g.id }, data: { status: "LOCKED" } });
  return { lines, restaurant: { id: g.restaurant.id, name: g.restaurant.displayName, slug: g.restaurant.slug, currency: g.restaurant.currency } };
}

/** Back from checkout without ordering: friends can change their items again. */
export async function unlockGroup(code: string, v: Viewer) {
  const g = await hostGroup(code, v);
  if (g.status !== "LOCKED") return;
  await prisma.groupCart.update({ where: { id: g.id }, data: { status: "OPEN" } });
}

/** The order was placed: everyone sees it, and the group closes. */
export async function markGroupOrdered(code: string, v: Viewer, reference: string) {
  const g = await hostGroup(code, v);
  const order = await prisma.order.findUnique({ where: { reference }, select: { id: true, restaurantId: true, userId: true, deviceKey: true } });
  if (!order || order.restaurantId !== g.restaurantId || !((v.userId && order.userId === v.userId) || order.deviceKey === v.device)) throw new GroupError("Order not found", 404);
  await prisma.groupCart.update({ where: { id: g.id }, data: { status: "ORDERED", orderId: order.id } });
}

/** The host removes someone; a friend leaves. */
export async function removeMember(code: string, v: Viewer, memberId: string) {
  const g = await hostGroup(code, v);
  const m = g.members.find((x) => x.id === memberId);
  if (!m || m.isHost) throw new GroupError("Can't remove this person");
  await prisma.groupCartMember.delete({ where: { id: m.id } });
}

export async function leaveGroup(code: string, v: Viewer) {
  const g = await load(code);
  const me = g.members.find((m) => m.deviceKey === v.device);
  if (!me) return;
  if (me.isHost) throw new GroupError("You started this group: cancel it instead");
  await prisma.groupCartMember.delete({ where: { id: me.id } });
}

export async function cancelGroup(code: string, v: Viewer) {
  const g = await hostGroup(code, v);
  if (g.status === "ORDERED") return;
  await prisma.groupCart.update({ where: { id: g.id }, data: { status: "CANCELED" } });
}

/** Old groups are removed after a week (they're only needed while ordering). */
export async function purgeOldGroups(now = new Date()) {
  const r = await prisma.groupCart.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
  return r.count;
}
