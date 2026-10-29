import "server-only";
import { prisma } from "./db";
import { slugify } from "@/lib/slug";

export async function uniqueSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === excludeId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type ChecklistStep = { key: string; label: string; done: boolean; href: string };

export async function onboardingChecklist(restaurantId: string): Promise<ChecklistStep[]> {
  const r = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    include: { _count: { select: { menuItems: { where: { archived: false } }, reels: true } } },
  });
  const withPhotos = await prisma.menuItem.count({ where: { restaurantId, archived: false, images: { some: {} } } });
  return [
    { key: "info", label: "Restaurant information", done: !!(r.displayName && r.address && r.description && r.logoUrl), href: "/dashboard/settings" },
    { key: "whatsapp", label: "WhatsApp ordering number", done: !!r.whatsappNumber, href: "/dashboard/settings#ordering" },
    { key: "fulfillment", label: "Delivery & pickup settings", done: r.deliveryEnabled || r.pickupEnabled, href: "/dashboard/settings#ordering" },
    { key: "menu", label: "Upload your menu", done: r._count.menuItems > 0, href: "/dashboard/menu/import" },
    { key: "photos", label: "Add menu photos", done: r._count.menuItems > 0 && withPhotos >= Math.ceil(r._count.menuItems / 2), href: "/dashboard/menu/photos" },
    { key: "agreement", label: "Accept the commission agreement", done: !!r.agreementAcceptedAt, href: "/dashboard/agreement" },
    { key: "publish", label: "Publish your profile", done: r.status === "ACTIVE" || r.status === "PENDING_APPROVAL", href: "/dashboard/publish" },
    { key: "reels", label: "Upload your first reel", done: r._count.reels > 0, href: "/dashboard/reels/new" },
  ];
}

export function publicRestaurantWhere() {
  return { status: "ACTIVE" as const };
}
