import type { MetadataRoute } from "next";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const [restaurants, items, categories, reels] = await Promise.all([
    prisma.restaurant.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true } }),
    prisma.menuItem.findMany({ where: { archived: false, restaurant: { status: "ACTIVE" } }, select: { id: true, updatedAt: true }, take: 20000 }),
    prisma.foodCategory.findMany({ where: { active: true }, select: { slug: true } }),
    prisma.reel.findMany({ where: { visibility: "PUBLISHED", status: "READY", restaurant: { status: "ACTIVE" } }, select: { id: true, updatedAt: true }, take: 20000 }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/restaurants`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/business`, changeFrequency: "monthly", priority: 0.5 },
    ...categories.map((c) => ({ url: `${base}/category/${c.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...restaurants.map((r) => ({ url: `${base}/r/${r.slug}`, lastModified: r.updatedAt, changeFrequency: "daily" as const, priority: 0.9 })),
    ...items.map((i) => ({ url: `${base}/item/${i.id}`, lastModified: i.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...reels.map((r) => ({ url: `${base}/reel/${r.id}`, lastModified: r.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
