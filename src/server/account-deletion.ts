import "server-only";
import { prisma } from "./db";
import { verifyPassword } from "./auth";
import { audit } from "./audit";
import { notifyAdmins } from "./notifications";
import { recomputeItemRating, recomputeRestaurantRating } from "./reviews";

// "Delete my account" (required by the App Store and Google Play). Personal data is removed;
// past orders stay for the restaurant's records and commission invoices, without the person's
// name, phone or address.

const OPEN = ["PLACED", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] as const;

export type DeletionCheck = { ok: true } | { ok: false; reason: "owner" | "open_order" | "admin"; restaurants?: string[] };

/** Can this account be deleted right now? */
export async function deletionBlocker(userId: string): Promise<DeletionCheck> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { roles: { select: { role: true } }, staff: { where: { role: "OWNER" }, select: { restaurant: { select: { displayName: true } } } } } });
  if (!u) return { ok: true };
  if (u.roles.some((r) => r.role === "ADMIN")) return { ok: false, reason: "admin" };
  if (u.staff.length) return { ok: false, reason: "owner", restaurants: u.staff.map((s) => s.restaurant.displayName) };
  if (await prisma.order.count({ where: { userId, status: { in: [...OPEN] } } })) return { ok: false, reason: "open_order" };
  return { ok: true };
}

export async function deleteAccount(userId: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } });
  if (!user) return { ok: false, error: "Account not found" };
  if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "Incorrect password" };
  const block = await deletionBlocker(userId);
  if (!block.ok)
    return {
      ok: false,
      error:
        block.reason === "open_order"
          ? "You have an order in progress. You can delete your account once it's finished."
          : block.reason === "owner"
            ? "You own a restaurant on numnum. Ask us to close the restaurant account first."
            : "Admin accounts can't be deleted from the app.",
    };

  const key = `u:${userId}`;
  const [itemReviews, restaurantReviews, likes] = await Promise.all([
    prisma.itemReview.findMany({ where: { userId }, select: { menuItemId: true } }),
    prisma.restaurantReview.findMany({ where: { userId }, select: { restaurantId: true } }),
    prisma.reelLike.findMany({ where: { ownerKey: key }, select: { reelId: true } }),
  ]);

  await prisma.$transaction(async (tx) => {
    // Orders stay (restaurant records, invoices) without personal details.
    await tx.order.updateMany({
      where: { userId },
      data: { customerName: "Deleted customer", customerPhone: "", address: null, building: null, notes: null, mapsUrl: null, latitude: null, longitude: null, userId: null, deviceKey: null },
    });
    await tx.savedItem.deleteMany({ where: { ownerKey: key } });
    await tx.reelLike.deleteMany({ where: { ownerKey: key } });
    for (const reelId of new Set(likes.map((l) => l.reelId))) {
      await tx.reel.update({ where: { id: reelId }, data: { likeCount: await tx.reelLike.count({ where: { reelId } }) } });
    }
    // Reviews, addresses, sessions, devices, notifications and blocks go with the account.
    await tx.user.delete({ where: { id: userId } });
  });

  for (const id of new Set(itemReviews.map((r) => r.menuItemId))) await recomputeItemRating(id);
  for (const id of new Set(restaurantReviews.map((r) => r.restaurantId))) await recomputeRestaurantRating(id);
  await audit({ actorId: null, action: "user.self_delete", entityType: "user", entityId: userId, data: { reviews: itemReviews.length + restaurantReviews.length } });
  return { ok: true };
}

/** Restaurant owners: ask numnum to close the restaurant (and then the account). */
export async function requestRestaurantClosure(userId: string, note: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, staff: { where: { role: "OWNER" }, select: { restaurant: { select: { id: true, displayName: true } } } } } });
  if (!u || !u.staff.length) return false;
  const names = u.staff.map((s) => s.restaurant.displayName).join(", ");
  await notifyAdmins({ type: "ACCOUNT_DELETION_REQUEST", title: `Account deletion request: ${u.name} (${names})`, body: `${u.email}${note ? ` · ${note.slice(0, 300)}` : ""}`, link: `/admin/restaurants/${u.staff[0].restaurant.id}` });
  await audit({ actorId: userId, action: "user.deletion_request", entityType: "user", entityId: userId, data: { restaurants: names } });
  return true;
}
