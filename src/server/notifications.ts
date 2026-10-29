import { prisma, type Tx } from "./db";
import { sendEmail } from "./email";

type NotifyInput = { type: string; title: string; body?: string; link?: string };

export async function notifyRestaurant(restaurantId: string, n: NotifyInput, tx?: Tx, opts: { email?: boolean } = {}) {
  const client = tx ?? prisma;
  await client.notification.create({ data: { audience: "RESTAURANT", restaurantId, ...n } });
  if (opts.email) {
    const r = await client.restaurant.findUnique({ where: { id: restaurantId }, select: { email: true } });
    if (r?.email) void sendEmail(r.email, n.title, `${n.body ?? ""}\n\n${process.env.APP_URL ?? ""}${n.link ?? ""}`);
  }
}

export async function notifyAdmins(n: NotifyInput, tx?: Tx) {
  const client = tx ?? prisma;
  await client.notification.create({ data: { audience: "ADMIN", ...n } });
}

export async function notifyUser(userId: string, n: NotifyInput, tx?: Tx) {
  const client = tx ?? prisma;
  await client.notification.create({ data: { audience: "USER", userId, ...n } });
}
