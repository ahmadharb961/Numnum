import { prisma, type Tx } from "./db";
import { sendEmail } from "./email";
import { tFor } from "@/i18n/server";
import type { T, Vars } from "@/i18n/core";

// Texts are English (optionally a template with values) and are translated into the
// recipient's language (their account setting) when stored and emailed.
export type Text = string | { k: string; v?: Vars };
type NotifyInput = { type: string; title: Text; body?: Text | null; link?: string };

export const render = (t: T, x: Text | null | undefined) => (x == null ? undefined : typeof x === "string" ? t(x) : t(x.k, x.v));

/** A restaurant's language: its owner's choice (else the first staff member's). */
export async function restaurantT(restaurantId: string, client: Tx | typeof prisma = prisma): Promise<T> {
  const staff = await client.restaurantStaff.findFirst({ where: { restaurantId }, orderBy: [{ role: "asc" }], select: { user: { select: { locale: true } } } });
  return tFor(staff?.user.locale);
}

export async function userT(userId: string, client: Tx | typeof prisma = prisma): Promise<T> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { locale: true } });
  return tFor(u?.locale);
}

export async function notifyRestaurant(restaurantId: string, n: NotifyInput, tx?: Tx, opts: { email?: boolean } = {}) {
  const client = tx ?? prisma;
  const t = await restaurantT(restaurantId, client);
  const title = render(t, n.title)!;
  const body = render(t, n.body);
  await client.notification.create({ data: { audience: "RESTAURANT", restaurantId, type: n.type, title, body, link: n.link } });
  if (opts.email) {
    const r = await client.restaurant.findUnique({ where: { id: restaurantId }, select: { email: true } });
    if (r?.email) void sendEmail(r.email, title, `${body ?? ""}\n\n${process.env.APP_URL ?? ""}${n.link ?? ""}`);
  }
}

export async function notifyAdmins(n: { type: string; title: string; body?: string; link?: string }, tx?: Tx) {
  const client = tx ?? prisma;
  await client.notification.create({ data: { audience: "ADMIN", ...n } });
}

export async function notifyUser(userId: string, n: NotifyInput, tx?: Tx) {
  const client = tx ?? prisma;
  const t = await userT(userId, client);
  await client.notification.create({ data: { audience: "USER", userId, type: n.type, title: render(t, n.title)!, body: render(t, n.body), link: n.link } });
}
