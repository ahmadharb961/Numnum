import "server-only";
import { prisma } from "./db";
import { getCurrentUser } from "./auth";
import { deviceId } from "./request";
import { canViewOrder } from "./orders";

/** Loads an order for the customer viewing it (account, same device, or tracking token), else null. */
export async function loadCustomerOrder(reference: string, token?: string | null) {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: { include: { customizations: true } }, restaurant: { select: { slug: true, logoUrl: true, phone: true } } },
  });
  if (!order) return null;
  const user = await getCurrentUser();
  const viewer = { userId: user?.id ?? null, deviceKey: await deviceId(), token };
  return canViewOrder(order, viewer) ? { order, viewer } : null;
}
