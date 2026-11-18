import { beforeEach, describe, expect, it, vi } from "vitest";

// Videos aren't really transcoded here: processing is simulated (status READY + creatorReelReady).
process.env.INLINE_JOBS = "false";
const emails = vi.hoisted(() => [] as { to: string; subject: string; html: string; text: string }[]);
vi.mock("@/server/email", () => ({
  sendEmail: async (to: string, subject: string, text: string) => (emails.push({ to, subject, html: "", text }), true),
  sendRichEmail: async (to: string, subject: string, html: string, text: string) => (emails.push({ to, subject, html, text }), true),
}));
vi.mock("@/server/push", () => ({ pushInLanguages: async () => 0, pushToRestaurantStaff: async () => 0, pushToUsers: async () => 0 }));

import { prisma } from "@/server/db";
import { publicReelWhere } from "@/server/feed";
import { followingFeed } from "@/server/follows";
import {
  applyAsCreator,
  createCreatorReel,
  creatorReelReady,
  creatorWelcomeEmail,
  decideCreator,
  decideTag,
  decideVerification,
  expireCreatorTags,
  pinReel,
  removeTag,
  requestVerification,
  retagReel,
  setCreatorBlocked,
  setCreatorFollow,
  suspendCreator,
  updateCreatorProfile,
  DAILY_REELS,
  OWN_RESTAURANT,
  PIN_MAX,
} from "@/server/creators";
import { makeCustomer, makeRestaurant, resetDb } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 150));
let v = 0;
async function video(userId: string) {
  return prisma.mediaAsset.create({ data: { restaurantId: null, kind: "VIDEO", storageKey: `video/u-${userId}/raw/v${++v}.mp4`, url: "", mimeType: "video/mp4", sizeBytes: 1000, uploadedById: userId } });
}
/** The video "finished processing". */
async function ready(reelId: string) {
  await prisma.reel.update({ where: { id: reelId }, data: { status: "READY", videoUrl: "/media/x.mp4" } });
  await creatorReelReady(reelId);
}
async function approvedCreator(handle = `rana${++v}`) {
  const u = await makeCustomer();
  const c = await applyAsCreator(u.id, { handle, displayName: "Rana Eats", bio: "Burgers in Beirut", instagram: "@rana", audienceSize: "12000", area: "Beirut" });
  const admin = await makeCustomer();
  await decideCreator(admin.id, c.id, true);
  return { user: u, creator: c, admin };
}
const isPublic = async (id: string) => !!(await prisma.reel.findFirst({ where: { ...publicReelWhere, id } }));

describe("applying and approval", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });

  it("checks the handle, keeps one application per person, and admins approve with a welcome email", async () => {
    const u = await makeCustomer();
    await expect(applyAsCreator(u.id, { handle: "a", displayName: "Rana" })).rejects.toThrow();
    await expect(applyAsCreator(u.id, { handle: "admin", displayName: "Rana" })).rejects.toThrow();
    const c = await applyAsCreator(u.id, { handle: "@Rana.Eats", displayName: "Rana Haddad" });
    expect(c.handle).toBe("rana.eats");
    expect(c.status).toBe("PENDING");
    await expect(applyAsCreator(u.id, { handle: "rana2", displayName: "Rana" })).rejects.toThrow(/being reviewed/);
    const other = await makeCustomer();
    await expect(applyAsCreator(other.id, { handle: "rana.eats", displayName: "X Y" })).rejects.toThrow(/taken/);
    expect(await prisma.notification.count({ where: { audience: "ADMIN", type: "creator_application" } })).toBe(1);

    await decideCreator(other.id, c.id, true);
    await flush();
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("APPROVED");
    const welcome = emails.find((e) => e.to === u.email)!;
    expect(welcome.subject).toBe("Welcome to numnum creators 🎉");
    for (const s of ["Welcome to numnum creators, Rana!", "numnum.me/c/rana.eats", "Tag the restaurant and the exact dish", "Open my creator studio", "Pin up to 6 reels", "verified badge"]) expect(welcome.html).toContain(s);
    expect(await prisma.notification.count({ where: { userId: u.id, type: "creator_approved" } })).toBe(1);
  });

  it("the welcome email is in Arabic for Arabic speakers, with the store links once the apps are live", () => {
    const m = creatorWelcomeEmail({ name: "Rana Haddad", handle: "rana.eats", appLinks: { ios: "https://apps.apple.com/app/id1", android: "" } }, "ar");
    expect(m.html).toContain('dir="rtl"');
    expect(m.subject).not.toBe("Welcome to numnum creators 🎉");
    expect(m.text).toContain("App Store: https://apps.apple.com/app/id1");
    expect(m.text).not.toContain("Google Play");
  });

  it("a declined applicant gets the reason and can apply again", async () => {
    const u = await makeCustomer();
    const c = await applyAsCreator(u.id, { handle: "rana.eats", displayName: "Rana Haddad" });
    await decideCreator(u.id, c.id, false, "Add your Instagram");
    await flush();
    expect(emails.find((e) => e.to === u.email)?.text).toContain("Add your Instagram");
    const again = await applyAsCreator(u.id, { handle: "rana.eats", displayName: "Rana Haddad", instagram: "@rana" });
    expect(again.status).toBe("PENDING");
  });

  it("verification: request once, admin approves (badge)", async () => {
    const { user, creator, admin } = await approvedCreator();
    await requestVerification(user.id, "DM me on Instagram");
    await expect(requestVerification(user.id, "again")).rejects.toThrow(/being reviewed/);
    await decideVerification(admin.id, creator.id, true);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } })).verification).toBe("APPROVED");
    await expect(requestVerification(user.id, "x")).rejects.toThrow(/already verified/);
  });
});

describe("reels, tags and the feed", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });

  it("a restaurant's own people can't tag it as creators (their food goes in the restaurant's own reels)", async () => {
    const own = await makeRestaurant();
    const other = await makeRestaurant();
    // The owner is also a food creator, with the same account.
    const c = await applyAsCreator(own.user.id, { handle: `owner.eats${++v}`, displayName: "Owner Eats" });
    await decideCreator((await makeCustomer()).id, c.id, true);
    await expect(createCreatorReel(own.user.id, { videoAssetId: (await video(own.user.id)).id, menuItemId: own.burger.id })).rejects.toThrow(OWN_RESTAURANT);
    expect(await prisma.reel.count({ where: { creatorId: c.id } })).toBe(0);
    // Other restaurants are fine.
    const reel = await createCreatorReel(own.user.id, { videoAssetId: (await video(own.user.id)).id, menuItemId: other.burger.id });
    expect(reel.restaurantId).toBe(other.restaurant.id);
    // Declined there, they can't re-tag it onto their own restaurant either.
    await ready(reel.id);
    await decideTag(other.restaurant.id, other.user.id, reel.id, false, "Not our dish");
    await expect(retagReel(own.user.id, reel.id, own.burger.id, false)).rejects.toThrow(OWN_RESTAURANT);
    // Staff (not only owners) count too.
    const { user: staffer } = await approvedCreator();
    await prisma.restaurantStaff.create({ data: { restaurantId: other.restaurant.id, userId: staffer.id, role: "STAFF" } });
    await expect(createCreatorReel(staffer.id, { videoAssetId: (await video(staffer.id)).id, menuItemId: other.burger.id })).rejects.toThrow(OWN_RESTAURANT);
  });

  it("a creator who starts working at the restaurant after tagging it can't be approved by it", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await ready(reel.id);
    await prisma.restaurantStaff.create({ data: { restaurantId: f.restaurant.id, userId: user.id, role: "STAFF" } });
    await expect(decideTag(f.restaurant.id, f.user.id, reel.id, true)).rejects.toThrow(/works at your restaurant/);
    expect(await isPublic(reel.id)).toBe(false);
    await decideTag(f.restaurant.id, f.user.id, reel.id, false); // declining still works
    expect((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).tagStatus).toBe("DECLINED");
  });

  it("a reel waits for the restaurant, which is asked once; accepting puts it live with the creator", async () => {
    const f = await makeRestaurant();
    const { user, creator } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id, caption: "So good", paidPartnership: true });
    expect(reel).toMatchObject({ restaurantId: f.restaurant.id, creatorId: creator.id, tagStatus: "PENDING", visibility: "DRAFT", paidPartnership: true });
    expect(await prisma.notification.count({ where: { restaurantId: f.restaurant.id, type: "creator_tag" } })).toBe(0); // not before the video is ready
    await ready(reel.id);
    await creatorReelReady(reel.id); // a second "ready" (e.g. cron) doesn't ask again
    expect(await prisma.notification.count({ where: { restaurantId: f.restaurant.id, type: "creator_tag" } })).toBe(1);
    expect(await isPublic(reel.id)).toBe(false);

    await decideTag(f.restaurant.id, f.user.id, reel.id, true);
    expect(await isPublic(reel.id)).toBe(true);
    const r = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
    expect(r).toMatchObject({ tagStatus: "ACCEPTED", visibility: "PUBLISHED" });
    expect(await prisma.notification.count({ where: { userId: user.id, type: "creator_tag_accepted" } })).toBe(1);
    await expect(decideTag(f.restaurant.id, f.user.id, reel.id, false)).rejects.toThrow(/already answered/);
    // The restaurant's own reels pages leave creator reels out.
    expect(await prisma.reel.count({ where: { restaurantId: f.restaurant.id, creatorId: null } })).toBe(0);
  });

  it("accepted before the video was ready: it goes live once processing finishes", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await prisma.reel.update({ where: { id: reel.id }, data: { tagStatus: "ACCEPTED" } });
    await ready(reel.id);
    expect(await isPublic(reel.id)).toBe(true);
  });

  it("declined with a reason, then tagged to another restaurant; removed later; blocked", async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant();
    const { user, creator } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: a.burger.id });
    await ready(reel.id);
    await decideTag(a.restaurant.id, a.user.id, reel.id, false, "Not our burger");
    expect(await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).toMatchObject({ tagStatus: "DECLINED", tagNote: "Not our burger" });
    await retagReel(user.id, reel.id, b.burger.id, false);
    expect(await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).toMatchObject({ restaurantId: b.restaurant.id, tagStatus: "PENDING" });
    expect(await prisma.notification.count({ where: { restaurantId: b.restaurant.id, type: "creator_tag" } })).toBe(1);
    await decideTag(b.restaurant.id, b.user.id, reel.id, true);
    await removeTag(b.restaurant.id, b.user.id, reel.id, "Menu changed");
    expect(await isPublic(reel.id)).toBe(false);
    expect((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).tagStatus).toBe("REMOVED");

    await setCreatorBlocked(a.restaurant.id, a.user.id, creator.id, true);
    await expect(createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: a.fries.id })).rejects.toThrow(/doesn't accept tags/);
    await setCreatorBlocked(a.restaurant.id, a.user.id, creator.id, false);
    await expect(createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: a.fries.id })).resolves.toBeTruthy();
  });

  it("only approved creators post, with their own uploaded video, up to DAILY_REELS a day", async () => {
    const f = await makeRestaurant();
    const pending = await makeCustomer();
    await applyAsCreator(pending.id, { handle: "waiting", displayName: "Wait Ing" });
    await expect(createCreatorReel(pending.id, { videoAssetId: (await video(pending.id)).id, menuItemId: f.burger.id })).rejects.toThrow(/approved creators/);
    const { user } = await approvedCreator();
    const someoneElse = await makeCustomer();
    await expect(createCreatorReel(user.id, { videoAssetId: (await video(someoneElse.id)).id, menuItemId: f.burger.id })).rejects.toThrow(/upload/);
    for (let i = 0; i < DAILY_REELS; i++) await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await expect(createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id })).rejects.toThrow(/most reels for today/);
  });

  it("pins live reels, up to PIN_MAX", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const ids: string[] = [];
    for (let i = 0; i < PIN_MAX + 1; i++) {
      const r = await prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: (await video(user.id)).id, creatorId: (await prisma.creator.findUniqueOrThrow({ where: { userId: user.id } })).id, tagStatus: "ACCEPTED", status: "READY", visibility: "PUBLISHED", publishedAt: new Date() } });
      ids.push(r.id);
    }
    for (const id of ids.slice(0, PIN_MAX)) await pinReel(user.id, id, true);
    await expect(pinReel(user.id, ids[PIN_MAX], true)).rejects.toThrow(/up to 6/);
    await pinReel(user.id, ids[0], false);
    await expect(pinReel(user.id, ids[PIN_MAX], true)).resolves.toBeTruthy();
  });

  it("tags nobody answers expire after 7 days", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await ready(reel.id);
    expect(await expireCreatorTags(new Date(Date.now() + 6 * 86400_000))).toBe(0);
    expect(await expireCreatorTags(new Date(Date.now() + 8 * 86400_000))).toBe(1);
    expect((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).tagStatus).toBe("EXPIRED");
    expect(await prisma.notification.count({ where: { userId: user.id, type: "creator_tag_expired" } })).toBe(1);
  });

  it("followers: counted, notified of a new live reel, and see it in Following; a suspension hides it everywhere", async () => {
    const f = await makeRestaurant();
    const { user, creator, admin } = await approvedCreator();
    const fan = await makeCustomer();
    await expect(setCreatorFollow(user.id, creator.id, true)).rejects.toThrow(/yourself/);
    expect(await setCreatorFollow(fan.id, creator.id, true)).toEqual({ following: true, followerCount: 1 });
    expect((await setCreatorFollow(fan.id, creator.id, true)).followerCount).toBe(1); // twice = once
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await ready(reel.id);
    await decideTag(f.restaurant.id, f.user.id, reel.id, true);
    await flush();
    expect(await prisma.notification.count({ where: { userId: fan.id, type: "follow_creator_reel" } })).toBe(1);
    expect((await followingFeed(fan.id)).reels.map((r) => r.id)).toEqual([reel.id]);
    const shown = (await followingFeed(fan.id)).reels[0];
    expect(shown.creator).toMatchObject({ handle: creator.handle, verified: false });

    await suspendCreator(admin.id, creator.id, true, "Spam");
    expect(await isPublic(reel.id)).toBe(false);
    expect((await followingFeed(fan.id)).reels).toHaveLength(0);
    await suspendCreator(admin.id, creator.id, false);
    expect(await isPublic(reel.id)).toBe(true);
  });
});

describe("search finds creators", () => {
  beforeEach(resetDb);

  it("by username, name or bio; approved creators only; counted on the Creators tab", async () => {
    const { exploreSearch } = await import("@/server/explore-search");
    const { user, creator, admin } = await approvedCreator("mr.foodies");
    await updateCreatorProfile(user.id, { displayName: "Mr. Foodies", bio: "Shawarma hunter" });
    const pendingUser = await makeCustomer();
    await applyAsCreator(pendingUser.id, { handle: "foodies.pending", displayName: "Pending Foodies" });
    const find = async (q: string) => (await exploreSearch({ q, type: "creators" }, null)).creators!.map((c) => c.handle);
    expect(await find("foodies")).toEqual(["mr.foodies"]);
    expect(await find("mr foodies")).toEqual(["mr.foodies"]);
    expect(await find("shawarma hunter")).toEqual(["mr.foodies"]);
    expect(await find("nobody-like-this")).toEqual([]);
    const r = await exploreSearch({ q: "foodies", type: "dishes" }, null);
    expect(r.counts.creators).toBe(1);
    await suspendCreator(admin.id, creator.id, true);
    expect(await find("FOODIES")).toEqual([]); // (a new query: identical searches are cached for 20 s)
  });
});
