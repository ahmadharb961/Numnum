import { prisma } from "@/server/db";

// A customer's or creator's own notifications (Account → Notifications): approvals, tags, new
// followers, new reels and deals from who they follow. Restaurants and admins have their own.

export function userNotifications(userId: string, take = 60) {
  return prisma.notification.findMany({
    where: { audience: "USER", userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, title: true, body: true, link: true, imageUrl: true, readAt: true, createdAt: true },
  });
}

export function unreadUserCount(userId: string) {
  return prisma.notification.count({ where: { audience: "USER", userId, readAt: null } });
}

export function markUserNotificationsRead(userId: string) {
  return prisma.notification.updateMany({ where: { audience: "USER", userId, readAt: null }, data: { readAt: new Date() } });
}
