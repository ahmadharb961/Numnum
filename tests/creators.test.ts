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
  changeCreatorHandle,
  checkHandle,
  handleRedirect,
  nextHandleChange,
  celebrateFirstCreatorOrders,
  followerName,
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
  restaurantsForCreator,
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
// Creators need a profile photo and a banner: uploads of the applicant's own.
async function pics(userId: string) {
  const img = (k: string) => prisma.mediaAsset.create({ data: { restaurantId: null, kind: "IMAGE", storageKey: `img/${k}-${userId}.webp`, url: `/media/i/${k}-${userId}.webp`, thumbUrl: `/media/i/${k}-${userId}-t.webp`, mimeType: "image/webp", sizeBytes: 1, uploadedById: userId } });
  const [a, b] = await Promise.all([img("avatar"), img("banner")]);
  return { avatarAssetId: a.id, bannerAssetId: b.id };
}
const apply = async (userId: string, input: Record<string, unknown>) => applyAsCreator(userId, { ...(await pics(userId)), ...input });

async function approvedCreator(handle = `rana${++v}`) {
  const u = await makeCustomer();
  const c = await apply(u.id, { handle, displayName: "Rana Eats", bio: "Burgers in Beirut", instagram: "@rana", audienceSize: "12000", area: "Beirut" });
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
  it("a profile photo and a banner are both required", async () => {
    const u = await makeCustomer();
    await expect(applyAsCreator(u.id, { handle: "no.pics", displayName: "No Pics" })).rejects.toThrow(/profile photo/);
    const { avatarAssetId, bannerAssetId } = await pics(u.id);
    await expect(applyAsCreator(u.id, { handle: "no.pics", displayName: "No Pics", avatarAssetId })).rejects.toThrow(/banner/);
    const c = await applyAsCreator(u.id, { handle: "no.pics", displayName: "No Pics", avatarAssetId, bannerAssetId });
    expect(c.avatarUrl).toMatch(/avatar/);
    expect(c.bannerUrl).toBe(`/media/i/banner-${u.id}.webp`); // the full-size banner, not a thumbnail
    // Someone else's upload can't be used.
    const other = await makeCustomer();
    await expect(applyAsCreator(other.id, { handle: "steal.pics", displayName: "Steal", avatarAssetId, bannerAssetId })).rejects.toThrow(/profile photo/);
  });


  it("checks the handle, keeps one application per person, and admins approve with a welcome email", async () => {
    const u = await makeCustomer();
    await expect(apply(u.id, { handle: "a", displayName: "Rana" })).rejects.toThrow();
    await expect(apply(u.id, { handle: "admin", displayName: "Rana" })).rejects.toThrow();
    const c = await apply(u.id, { handle: "@Rana.Eats", displayName: "Rana Haddad" });
    expect(c.handle).toBe("rana.eats");
    expect(c.status).toBe("PENDING");
    await expect(apply(u.id, { handle: "rana2", displayName: "Rana" })).rejects.toThrow(/being reviewed/);
    const other = await makeCustomer();
    await expect(apply(other.id, { handle: "rana.eats", displayName: "X Y" })).rejects.toThrow(/taken/);
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
    const c = await apply(u.id, { handle: "rana.eats", displayName: "Rana Haddad" });
    await decideCreator(u.id, c.id, false, "Add your Instagram");
    await flush();
    expect(emails.find((e) => e.to === u.email)?.text).toContain("Add your Instagram");
    const again = await apply(u.id, { handle: "rana.eats", displayName: "Rana Haddad", instagram: "@rana" });
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
    const c = await apply(own.user.id, { handle: `owner.eats${++v}`, displayName: "Owner Eats" });
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

  it("'Restaurants to shoot' lists the restaurants a creator can tag (not blocked, not their own), with creator reels counted", async () => {
    const a = await makeRestaurant({ name: "Alpha Grill" });
    const b = await makeRestaurant({ name: "Beta Bakery" });
    const blocked = await makeRestaurant({ name: "Gamma Blocks" });
    const closed = await makeRestaurant({ name: "Delta Closed" });
    await prisma.restaurant.update({ where: { id: closed.restaurant.id }, data: { status: "SUSPENDED" } });
    const { user, creator } = await approvedCreator();
    await setCreatorBlocked(blocked.restaurant.id, blocked.user.id, creator.id, true);
    await prisma.restaurantStaff.create({ data: { restaurantId: b.restaurant.id, userId: user.id, role: "STAFF" } }); // works at Beta
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: a.burger.id });
    await ready(reel.id);
    await decideTag(a.restaurant.id, a.user.id, reel.id, true);
    const list = await restaurantsForCreator(user.id);
    expect(list.map((r) => r.displayName)).toEqual(["Alpha Grill"]);
    expect(list[0]).toMatchObject({ slug: a.restaurant.slug, dishes: 2, creatorReels: 1 });
    expect(await restaurantsForCreator((await makeCustomer()).id)).toEqual([]); // not a creator
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
    await apply(pending.id, { handle: "waiting", displayName: "Wait Ing" });
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

describe("the creator journey: followers, reminders, first order", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });
  const followNotes = (userId: string) => prisma.notification.findMany({ where: { audience: "USER", userId, type: "creator_new_follower" } });

  it("a new follower notifies the creator at once, once (unfollow + follow again doesn't repeat it)", async () => {
    const { user, creator } = await approvedCreator();
    const fan = await prisma.user.create({ data: { email: `fan${++v}@test.dev`, passwordHash: "x", name: "Rana Haddad", roles: { create: { role: "CUSTOMER" } } } });
    await setCreatorFollow(fan.id, creator.id, true);
    let notes = await followNotes(user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain("Rana H.");
    expect(notes[0].link).toBe(`/creator/followers?f=${fan.id}`);
    await setCreatorFollow(fan.id, creator.id, false);
    await setCreatorFollow(fan.id, creator.id, true);
    expect(await followNotes(user.id)).toHaveLength(1);
    const other = await makeCustomer();
    await setCreatorFollow(other.id, creator.id, true);
    notes = await followNotes(user.id);
    expect(notes).toHaveLength(2);
    expect(followerName("Rana Haddad")).toBe("Rana H.");
    expect(followerName("Ziad")).toBe("Ziad");
    expect(followerName("  Maya  El Khoury ")).toBe("Maya K.");
  });

  it("an unanswered tag: the restaurant is reminded once after 3 days, and it expires after 7", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await ready(reel.id);
    const reminders = () => prisma.notification.count({ where: { restaurantId: f.restaurant.id, type: "creator_tag_reminder" } });
    const at = (await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).tagRequestedAt!;
    await expireCreatorTags(new Date(at.getTime() + 2 * 86400_000));
    expect(await reminders()).toBe(0); // not yet
    await expireCreatorTags(new Date(at.getTime() + 3 * 86400_000 + 60_000));
    await expireCreatorTags(new Date(at.getTime() + 4 * 86400_000));
    expect(await reminders()).toBe(1); // once
    const n = await prisma.notification.findFirstOrThrow({ where: { restaurantId: f.restaurant.id, type: "creator_tag_reminder" } });
    expect(n.body).toContain('"n":4'); // 4 days left
    await expireCreatorTags(new Date(at.getTime() + 7 * 86400_000 + 60_000));
    expect((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).tagStatus).toBe("EXPIRED");
    expect(await prisma.notification.count({ where: { userId: user.id, type: "creator_tag_expired" } })).toBe(1);
  });

  it("a creator's reel bringing its first order is celebrated once", async () => {
    const f = await makeRestaurant();
    const { user } = await approvedCreator();
    const reel = await createCreatorReel(user.id, { videoAssetId: (await video(user.id)).id, menuItemId: f.burger.id });
    await prisma.reel.update({ where: { id: reel.id }, data: { orderInits: 1 } });
    await celebrateFirstCreatorOrders([reel.id]);
    await celebrateFirstCreatorOrders([reel.id]);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "creator_first_order" } })).toBe(1);
    await prisma.reel.update({ where: { id: reel.id }, data: { orderInits: 2 } });
    await celebrateFirstCreatorOrders([reel.id]);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "creator_first_order" } })).toBe(1);
  });
});

describe("changing the username", () => {
  beforeEach(resetDb);

  it("once every 3 months; the old one redirects and stays theirs; an admin can change it any time", async () => {
    const { user, creator } = await approvedCreator("rana.eats");
    const other = await makeCustomer();
    // The live check: their own username is "current", another free one is available.
    expect(await checkHandle(user.id, "rana.eats")).toMatchObject({ available: true, current: true });
    expect(await checkHandle(user.id, "rana.bites")).toMatchObject({ available: true });

    const changed = await changeCreatorHandle(creator.id, "@Rana.Bites");
    expect(changed.handle).toBe("rana.bites");
    expect(changed.handleChangedAt).not.toBeNull();
    expect(changed.searchName).toContain("rana");
    // The old username: redirects, and nobody else can take it.
    expect(await handleRedirect("rana.eats")).toBe("rana.bites");
    expect(await checkHandle(other.id, "rana.eats")).toMatchObject({ available: false, error: "This username is taken" });
    await expect(apply(other.id, { handle: "rana.eats", displayName: "Someone Else" })).rejects.toThrow(/taken/);
    // Not again within 3 months (a profile save with a new username too).
    await expect(changeCreatorHandle(creator.id, "rana.third")).rejects.toThrow(/again on/);
    await expect(updateCreatorProfile(user.id, { handle: "rana.third", displayName: "Rana" })).rejects.toThrow(/again on/);
    expect(nextHandleChange(changed)!.getTime()).toBeGreaterThan(Date.now() + 89 * 86400_000);
    // A profile save keeping the same username is fine.
    await updateCreatorProfile(user.id, { handle: "rana.bites", displayName: "Rana B" });

    // An admin: any time, without using up the creator's change.
    const admin = await makeCustomer();
    const byAdmin = await changeCreatorHandle(creator.id, "rana.official.lb", { byAdminId: admin.id });
    expect(byAdmin.handle).toBe("rana.official.lb");
    expect(byAdmin.handleChangedAt!.getTime()).toBe(changed.handleChangedAt!.getTime());
    expect(await handleRedirect("rana.bites")).toBe("rana.official.lb");
    expect(await handleRedirect("rana.eats")).toBe("rana.official.lb"); // every old one points to the current
    expect(await prisma.auditLog.count({ where: { entityId: creator.id, action: { in: ["creator.handle_change", "creator.handle_admin_change"] } } })).toBe(2);

    // After 3 months: the creator can change again, and old usernames are free for others.
    await prisma.creator.update({ where: { id: creator.id }, data: { handleChangedAt: new Date(Date.now() - 91 * 86400_000) } });
    await prisma.creatorHandleAlias.updateMany({ data: { createdAt: new Date(Date.now() - 91 * 86400_000) } });
    expect(await handleRedirect("rana.eats")).toBeNull();
    expect(await checkHandle(other.id, "rana.eats")).toMatchObject({ available: true });
    // They can take back one of their own old usernames.
    expect((await changeCreatorHandle(creator.id, "rana.bites")).handle).toBe("rana.bites");
    expect(await prisma.creatorHandleAlias.findUnique({ where: { handle: "rana.bites" } })).toBeNull();
  });
});

describe("search finds creators", () => {
  beforeEach(resetDb);

  it("by username, name or bio; approved creators only; counted on the Creators tab", async () => {
    const { exploreSearch } = await import("@/server/explore-search");
    const { user, creator, admin } = await approvedCreator("mr.foodies");
    await updateCreatorProfile(user.id, { displayName: "Mr. Foodies", bio: "Shawarma hunter" });
    const pendingUser = await makeCustomer();
    await apply(pendingUser.id, { handle: "foodies.pending", displayName: "Pending Foodies" });
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
