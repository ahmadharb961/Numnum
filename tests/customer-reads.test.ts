import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import type { CurrentUser } from "@/server/auth";

// The visitor these reads are made for (normally from the session cookie).
let viewer: CurrentUser | null = null;
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), getCurrentUser: async () => viewer }));

const { getFeed } = await import("@/server/feed");
const { getPublicItem } = await import("@/server/items");
const { getPublicRestaurant } = await import("@/server/restaurant-public");
const { makeCustomer, makeRestaurant, resetDb } = await import("./helpers");

beforeEach(async () => {
  await resetDb();
  viewer = null;
});

async function reelFor(f: Awaited<ReturnType<typeof makeRestaurant>>) {
  const video = await prisma.mediaAsset.create({ data: { kind: "VIDEO", url: "https://example.test/v.m3u8", storageKey: "db", mimeType: "video/mp4", sizeBytes: 1, restaurantId: f.restaurant.id } });
  return prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: video.id, videoUrl: video.url, visibility: "PUBLISHED", status: "READY", publishedAt: new Date() } });
}
const asViewer = (u: { id: string; email: string; name: string }) => (viewer = { id: u.id, email: u.email, name: u.name, phone: null, roles: ["CUSTOMER"] });

describe("what a customer sees, after merging the queries", () => {
  it("the feed leaves out restaurants the viewer blocked, and only for that viewer", async () => {
    const a = await makeRestaurant({ name: "Alpha Grill" });
    const b = await makeRestaurant({ name: "Beta Pizza" });
    const [ra, rb] = [await reelFor(a), await reelFor(b)];
    const me = await makeCustomer();
    const other = await makeCustomer();
    await prisma.userBlock.create({ data: { userId: me.id, restaurantId: a.restaurant.id } });
    const ids = async (viewerId?: string) => (await getFeed({ viewerId })).reels.map((r) => r.id).sort();
    expect(await ids(me.id)).toEqual([rb.id]);
    expect(await ids(other.id)).toEqual([ra.id, rb.id].sort());
    expect(await ids()).toEqual([ra.id, rb.id].sort());
  });

  it("a dish: everything loads together, reviews by blocked people are hidden", async () => {
    const f = await makeRestaurant();
    const [me, nice, rude] = [await makeCustomer(), await makeCustomer(), await makeCustomer()];
    await prisma.itemReview.create({ data: { menuItemId: f.burger.id, restaurantId: f.restaurant.id, userId: nice.id, rating: 5, body: "great" } });
    await prisma.itemReview.create({ data: { menuItemId: f.burger.id, restaurantId: f.restaurant.id, userId: rude.id, rating: 1, body: "rude" } });
    await prisma.userBlock.create({ data: { userId: me.id, blockedUserId: rude.id } });
    const guest = await getPublicItem(f.burger.id);
    expect(guest?.reviews.map((r) => r.body).sort()).toEqual(["great", "rude"]);
    expect(guest?.groups.map((g) => g.name)).toHaveLength(2); // options come with the dish
    expect(guest?.distribution.find((d) => d.stars === 1)?.count).toBe(1);
    asViewer(me);
    expect((await getPublicItem(f.burger.id))?.reviews.map((r) => r.body)).toEqual(["great"]);
    expect(await getPublicItem("nope")).toBeNull();
  });

  it("a restaurant page by slug or id: menu with photos, reviews without blocked people", async () => {
    const f = await makeRestaurant();
    const [me, rude] = [await makeCustomer(), await makeCustomer()];
    await prisma.restaurantReview.create({ data: { restaurantId: f.restaurant.id, userId: rude.id, rating: 1, body: "rude" } });
    await prisma.userBlock.create({ data: { userId: me.id, blockedUserId: rude.id } });
    const photo = await prisma.mediaAsset.create({ data: { kind: "IMAGE", url: "https://imagedelivery.net/h/p/orig", thumbUrl: "https://imagedelivery.net/h/p_t/orig", storageKey: "cf", mimeType: "image/webp", sizeBytes: 1, restaurantId: f.restaurant.id } });
    await prisma.menuItemImage.create({ data: { menuItemId: f.burger.id, assetId: photo.id, isMain: true } });
    const bySlug = await getPublicRestaurant(f.restaurant.slug);
    const items = bySlug!.sections.flatMap((s) => s.items);
    expect(items.find((i) => i.id === f.burger.id)?.image).toEqual({ url: photo.url, thumbUrl: photo.thumbUrl });
    expect(items.find((i) => i.id === f.fries.id)?.image).toBeNull();
    expect(bySlug!.reviews).toHaveLength(1);
    asViewer(me);
    const byId = await getPublicRestaurant(f.restaurant.id, "id");
    expect(byId!.restaurant.id).toBe(f.restaurant.id);
    expect(byId!.reviews).toHaveLength(0);
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { status: "SUSPENDED" } });
    expect(await getPublicRestaurant(f.restaurant.id, "id")).toBeNull();
  });
});
