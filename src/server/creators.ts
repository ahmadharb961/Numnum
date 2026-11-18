import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { enqueue } from "./jobs";
import { notifyAdmins, notifyRestaurant, notifyUser } from "./notifications";
import { pushInLanguages, pushToRestaurantStaff } from "./push";
import { sendRichEmail } from "./email";
import { emailParts } from "./restaurant-emails";
import { getSettings } from "./settings";
import { deleteStreamVideo, isStreamKey, streamUidOf, syncStreamReels } from "./stream";
import { encodeText } from "@/lib/notification-text";
import { tFor } from "@/i18n/server";
import { creatorSearchFields } from "./search-text";

// Food creators (bloggers): apply → an admin approves (welcome email) → they post reels tagging a
// restaurant's dish → the restaurant accepts (the reel goes live with the normal Order button) or
// declines. Creator reels are ordinary reels (same upload and video pipeline, so they load as fast)
// with a creator and a tag status; they're public only while ACCEPTED and the creator is APPROVED.

export const PIN_MAX = 6;
export const DAILY_REELS = 5;
export const TAG_DAYS = 7;
const NOTIFY_GAP_MS = 20 * 3600_000;
const BATCH = 500;
const RESERVED = new Set(["admin", "numnum", "support", "help", "official", "team", "staff", "restaurant", "restaurants", "creator", "creators", "dashboard", "account", "login", "settings"]);

export class CreatorError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((h) => h.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9._]{3,24}$/, "3–24 letters, numbers, dots or underscores").refine((h) => !RESERVED.has(h) && !/^[._]|[._]$|\.\./.test(h), "Choose another username"));
const optUrlOrHandle = z.string().trim().max(200).optional().transform((v) => v || null);

export const applySchema = z.object({
  handle: handleSchema,
  displayName: z.string().trim().min(2, "Enter your name").max(60),
  bio: z.string().trim().max(300).optional().transform((v) => v || null),
  instagram: optUrlOrHandle,
  tiktok: optUrlOrHandle,
  audienceSize: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  area: z.string().trim().max(80).optional().transform((v) => v || null),
  avatarAssetId: z.string().optional().nullable(),
});

export const profileSchema = applySchema.omit({ handle: true }).extend({ handle: z.string().optional() });

async function avatarUrl(userId: string, assetId: string | null | undefined) {
  if (!assetId) return undefined;
  const a = await prisma.mediaAsset.findFirst({ where: { id: assetId, uploadedById: userId, kind: "IMAGE" }, select: { url: true, thumbUrl: true } });
  return a ? (a.thumbUrl ?? a.url) : undefined;
}

// ───── Applying, approval, verification ─────

export const HANDLE_COOLDOWN_DAYS = 90; // a creator can change their username once every 3 months
const ALIAS_DAYS = 90; // an old username redirects (and stays theirs) for 3 months

/** Is this username someone else's: their username, or another creator's old one still reserved? */
async function handleTaken(handle: string, exceptCreatorId: string | null) {
  const [current, alias] = await Promise.all([
    prisma.creator.findFirst({ where: { handle, ...(exceptCreatorId ? { NOT: { id: exceptCreatorId } } : {}) }, select: { id: true } }),
    prisma.creatorHandleAlias.findFirst({ where: { handle, createdAt: { gt: new Date(Date.now() - ALIAS_DAYS * 86400_000) }, ...(exceptCreatorId ? { NOT: { creatorId: exceptCreatorId } } : {}) }, select: { handle: true } }),
  ]);
  return !!(current || alias);
}

/** Live check while typing a username: the cleaned-up form, and whether it's free. */
export async function checkHandle(userId: string, raw: string): Promise<{ handle: string; available: boolean; current?: boolean; error?: string }> {
  const parsed = handleSchema.safeParse(raw);
  const cleaned = String(raw ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!parsed.success) return { handle: cleaned, available: false, error: parsed.error.issues[0]?.message ?? "Choose another username" };
  const mine = await prisma.creator.findUnique({ where: { userId }, select: { id: true, handle: true } });
  if (mine?.handle === parsed.data) return { handle: parsed.data, available: true, current: true };
  const taken = await handleTaken(parsed.data, mine?.id ?? null);
  return { handle: parsed.data, available: !taken, ...(taken ? { error: "This username is taken" } : {}) };
}

/** When the creator may change their username again (null: now). */
export function nextHandleChange(c: { handleChangedAt: Date | null }, now = new Date()): Date | null {
  if (!c.handleChangedAt) return null;
  const next = new Date(c.handleChangedAt.getTime() + HANDLE_COOLDOWN_DAYS * 86400_000);
  return next > now ? next : null;
}

/**
 * Changes a creator's username. The creator: once every 3 months. An admin (byAdminId): any time,
 * without using up the creator's change. The old username redirects for 3 months and stays theirs.
 */
export async function changeCreatorHandle(creatorId: string, raw: string, opts: { byAdminId?: string } = {}) {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) throw new CreatorError(parsed.error.issues[0]?.message ?? "Choose another username", "handle");
  const handle = parsed.data;
  const c = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!c) throw new CreatorError("Creator not found");
  if (c.handle === handle) return c;
  if (!opts.byAdminId) {
    const next = nextHandleChange(c);
    if (next) throw new CreatorError(`You can change your username again on ${next.toISOString().slice(0, 10)}`, "handle");
  }
  if (await handleTaken(handle, c.id)) throw new CreatorError("This username is taken", "handle");
  const updated = await prisma.$transaction(async (tx) => {
    // Their old username keeps working (redirects) and stays theirs for a while.
    await tx.creatorHandleAlias.upsert({ where: { handle: c.handle }, create: { handle: c.handle, creatorId: c.id }, update: { creatorId: c.id, createdAt: new Date() } });
    await tx.creatorHandleAlias.deleteMany({ where: { handle } }); // taking back one of their own old usernames
    return tx.creator.update({ where: { id: c.id }, data: { handle, ...creatorSearchFields({ ...c, handle }), ...(opts.byAdminId ? {} : { handleChangedAt: new Date() }) } });
  });
  await audit({ actorId: opts.byAdminId ?? c.userId, action: opts.byAdminId ? "creator.handle_admin_change" : "creator.handle_change", entityType: "creator", entityId: c.id, data: { from: c.handle, to: handle } });
  return updated;
}

/** The creator an old username now points to (within the 3 months), for redirects. */
export async function handleRedirect(oldHandle: string): Promise<string | null> {
  const a = await prisma.creatorHandleAlias.findUnique({ where: { handle: oldHandle.toLowerCase() }, select: { createdAt: true, creator: { select: { handle: true, status: true } } } });
  if (!a || a.createdAt.getTime() < Date.now() - ALIAS_DAYS * 86400_000 || a.creator.status !== "APPROVED") return null;
  return a.creator.handle;
}

/** Apply to become a creator (or apply again after a decline). */
export async function applyAsCreator(userId: string, raw: unknown) {
  const input = applySchema.parse(raw);
  const existing = await prisma.creator.findUnique({ where: { userId } });
  if (existing && existing.status !== "DECLINED") throw new CreatorError(existing.status === "PENDING" ? "Your application is being reviewed" : "You're already a creator");
  if (await handleTaken(input.handle, existing?.id ?? null)) throw new CreatorError("This username is taken", "handle");
  const avatar = await avatarUrl(userId, input.avatarAssetId);
  const data = { handle: input.handle, displayName: input.displayName, bio: input.bio, instagram: input.instagram, tiktok: input.tiktok, audienceSize: input.audienceSize ?? null, area: input.area, ...(avatar ? { avatarUrl: avatar } : {}), status: "PENDING" as const, decisionNote: null, ...creatorSearchFields(input) };
  const c = existing ? await prisma.creator.update({ where: { id: existing.id }, data }) : await prisma.creator.create({ data: { ...data, userId } });
  await notifyAdmins({ type: "creator_application", title: `New creator application: @${c.handle}`, link: "/admin/creators" });
  return c;
}

/** Admin: approve (welcome email) or decline an application. */
export async function decideCreator(adminId: string, creatorId: string, approve: boolean, note?: string) {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: { select: { email: true, locale: true } } } });
  const updated = await prisma.creator.update({ where: { id: creatorId }, data: { status: approve ? "APPROVED" : "DECLINED", decisionNote: note?.trim().slice(0, 300) || null, ...(approve && !c.approvedAt ? { approvedAt: new Date() } : {}) } });
  await audit({ actorId: adminId, action: approve ? "creator.approve" : "creator.decline", entityType: "Creator", entityId: creatorId, data: { note } });
  await notifyUser(c.userId, approve ? { type: "creator_approved", title: "You're a numnum creator 🎉", body: "Post your first reel and tag the dish.", link: "/creator" } : { type: "creator_declined", title: "Your creator application wasn't approved", body: note?.trim() || null, link: "/creator/apply" });
  void pushInLanguages([{ id: c.userId, locale: c.user.locale }], (t) => ({ title: t(approve ? "You're a numnum creator 🎉" : "Your creator application wasn't approved"), body: approve ? t("Post your first reel and tag the dish.") : note?.trim() || "", url: approve ? "/creator" : "/creator/apply", tag: "creator-status" }));
  if (approve && c.status !== "APPROVED") void sendCreatorWelcome(creatorId).catch((e) => console.error("creator welcome", e));
  if (!approve) void sendCreatorDeclined(c.user.email, c.user.locale, c.displayName, note).catch((e) => console.error("creator declined", e));
  return updated;
}

/** Admin: suspend (their reels leave the feed at once) or restore a creator. */
export async function suspendCreator(adminId: string, creatorId: string, suspend: boolean, note?: string) {
  const c = await prisma.creator.update({ where: { id: creatorId }, data: { status: suspend ? "SUSPENDED" : "APPROVED", decisionNote: note?.trim().slice(0, 300) || null } });
  await audit({ actorId: adminId, action: suspend ? "creator.suspend" : "creator.restore", entityType: "Creator", entityId: creatorId, data: { note } });
  await notifyUser(c.userId, suspend ? { type: "creator_suspended", title: "Your creator account is suspended", body: note?.trim() || null, link: "/support" } : { type: "creator_restored", title: "Your creator account is active again", link: "/creator" });
  return c;
}

export async function updateCreatorProfile(userId: string, raw: unknown) {
  const input = profileSchema.parse(raw);
  const c = await prisma.creator.findUnique({ where: { userId } });
  if (!c || c.status !== "APPROVED") throw new CreatorError("Only approved creators can edit their profile");
  const avatar = await avatarUrl(userId, input.avatarAssetId);
  // A new username first (it can be refused: taken, or changed less than 3 months ago).
  const handle = input.handle != null && input.handle.trim() && input.handle.trim().toLowerCase().replace(/^@/, "") !== c.handle ? (await changeCreatorHandle(c.id, input.handle)).handle : c.handle;
  return prisma.creator.update({ where: { id: c.id }, data: { displayName: input.displayName, bio: input.bio, instagram: input.instagram, tiktok: input.tiktok, audienceSize: input.audienceSize ?? null, area: input.area, ...(avatar ? { avatarUrl: avatar } : {}), ...creatorSearchFields({ ...input, handle }) } });
}

/** The creator asks for the verified badge. */
export async function requestVerification(userId: string, note: string) {
  const c = await prisma.creator.findUnique({ where: { userId } });
  if (!c || c.status !== "APPROVED") throw new CreatorError("Only approved creators can request verification");
  if (c.verification === "APPROVED") throw new CreatorError("You're already verified");
  if (c.verification === "PENDING") throw new CreatorError("Your request is being reviewed");
  await prisma.creator.update({ where: { id: c.id }, data: { verification: "PENDING", verificationNote: note.trim().slice(0, 500) || null, verificationRequestedAt: new Date() } });
  await notifyAdmins({ type: "creator_verification", title: `@${c.handle} asked to be verified`, link: "/admin/creators?tab=verification" });
}

export async function decideVerification(adminId: string, creatorId: string, approve: boolean, note?: string) {
  const c = await prisma.creator.update({ where: { id: creatorId }, data: { verification: approve ? "APPROVED" : "DECLINED", verificationDecidedAt: new Date(), ...(note?.trim() ? { decisionNote: note.trim().slice(0, 300) } : {}) }, include: { user: { select: { locale: true } } } });
  await audit({ actorId: adminId, action: approve ? "creator.verify" : "creator.verify_decline", entityType: "Creator", entityId: creatorId, data: { note } });
  const title = approve ? "You're verified ✓" : "Your verification request wasn't approved";
  await notifyUser(c.userId, { type: "creator_verification", title, body: approve ? "The verified badge now shows on your profile and reels." : note?.trim() || null, link: "/creator" });
  void pushInLanguages([{ id: c.userId, locale: c.user.locale }], (t) => ({ title: t(title), body: approve ? t("The verified badge now shows on your profile and reels.") : note?.trim() || "", url: "/creator", tag: "creator-verification" }));
  return c;
}

// ───── Emails ─────

async function sendCreatorWelcome(creatorId: string) {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: { select: { email: true, locale: true } } } });
  const { appLinks } = await getSettings();
  const mail = creatorWelcomeEmail({ name: c.displayName, handle: c.handle, appLinks }, c.user.locale);
  return sendRichEmail(c.user.email, mail.subject, mail.html, mail.text);
}

/** The welcome email a creator gets once approved (exported for tests). */
export function creatorWelcomeEmail(d: { name: string; handle: string; appLinks?: { ios: string; android: string } }, locale: string | null | undefined) {
  const t = tFor(locale);
  const { layout, h1, p, small, button, esc, appUrl } = emailParts;
  const first = d.name.split(" ")[0] || d.name;
  const studio = `${appUrl()}/creator`;
  const profile = `${appUrl()}/c/${d.handle}`;
  const steps = [
    t("Post a reel from your creator studio: vertical video, good light, 15 to 60 seconds works best."),
    t("Tag the restaurant and the exact dish in the video."),
    t("The restaurant approves the tag, and your reel goes live with an Order button: people order the dish straight from your video."),
    t("Watch your views, likes and the orders your reels bring in Insights."),
  ];
  const tips = [t("Pin up to 6 reels at the top of your profile."), t("Ask for the verified badge from your studio."), t("If a restaurant paid you or gave you the food, tick “Paid partnership”.")];
  const ios = d.appLinks?.ios?.trim();
  const android = d.appLinks?.android?.trim();
  const apps = [ios && `App Store: ${ios}`, android && `Google Play: ${android}`].filter(Boolean) as string[];
  const li = (s: string, i: number) => `<p style="margin:8px 0;font:15px/1.5 Arial,sans-serif;color:#4a423d"><b style="color:#ff5412">${i + 1}.</b>&nbsp; ${esc(s)}</p>`;
  const html = layout(
    locale,
    `${h1(t("Welcome to numnum creators, {name}! 🎉", { name: first }))}
     ${p(t("Your creator account is approved. Your profile is live at {url}.", { url: `numnum.me/c/${d.handle}` }))}
     <h2 style="margin:18px 0 6px;font:800 17px Arial,sans-serif;color:#16120f">${esc(t("How it works"))}</h2>
     ${steps.map(li).join("")}
     ${button(t("Open my creator studio"), studio)}
     <h2 style="margin:18px 0 6px;font:800 17px Arial,sans-serif;color:#16120f">${esc(t("Good to know"))}</h2>
     ${tips.map((s) => p(`• ${esc(s)}`, true)).join("")}
     ${apps.length ? p(esc(t("Get the numnum app to post and follow your reels from your phone:")) + "<br>" + apps.map(esc).join("<br>"), true) : ""}
     ${small(esc(t("Your public profile: {url}", { url: profile })))}`,
  );
  const text = [t("Welcome to numnum creators, {name}! 🎉", { name: first }), "", t("Your creator account is approved. Your profile is live at {url}.", { url: `numnum.me/c/${d.handle}` }), "", t("How it works"), ...steps.map((s, i) => `${i + 1}. ${s}`), "", `${t("Open my creator studio")}: ${studio}`, "", t("Good to know"), ...tips.map((s) => `• ${s}`), ...(apps.length ? ["", t("Get the numnum app to post and follow your reels from your phone:"), ...apps] : [])].join("\n");
  return { subject: t("Welcome to numnum creators 🎉"), html, text };
}

async function sendCreatorDeclined(email: string, locale: string | null, name: string, note?: string) {
  const t = tFor(locale);
  const { layout, h1, p, button, appUrl } = emailParts;
  const first = name.split(" ")[0] || name;
  const html = layout(locale, `${h1(t("About your creator application, {name}", { name: first }))}${p(t("Thanks for applying. We can't approve your creator account right now."))}${note?.trim() ? p(t("Reason: {reason}", { reason: note.trim() })) : ""}${p(t("You can update your details and apply again."))}${button(t("Apply again"), `${appUrl()}/creator/apply`)}`);
  const text = [t("About your creator application, {name}", { name: first }), "", t("Thanks for applying. We can't approve your creator account right now."), ...(note?.trim() ? [t("Reason: {reason}", { reason: note.trim() })] : []), t("You can update your details and apply again."), `${appUrl()}/creator/apply`].join("\n");
  return sendRichEmail(email, t("About your numnum creator application"), html, text);
}

// ───── Reels ─────

export async function approvedCreator(userId: string) {
  const c = await prisma.creator.findUnique({ where: { userId } });
  if (!c || c.status !== "APPROVED") throw new CreatorError("Only approved creators can post reels");
  return c;
}

export const reelInputSchema = z.object({
  videoAssetId: z.string().min(1),
  menuItemId: z.string().min(1, "Choose the dish in your reel"),
  caption: z.string().trim().max(300).optional(),
  paidPartnership: z.boolean().default(false),
  posterAssetId: z.string().min(1).nullish(), // the cover they picked (a frame or a photo)
});

/**
 * A creator can't tag a restaurant they own or work at: customers would take it for an independent
 * recommendation. Their own food goes in the restaurant's own reels (dashboard).
 */
export const OWN_RESTAURANT = "You can't tag your own restaurant. Post it from your dashboard instead.";
async function worksAt(userId: string, restaurantId: string) {
  return !!(await prisma.restaurantStaff.findFirst({ where: { userId, restaurantId }, select: { id: true } }));
}

/** Posts a reel tagging a restaurant's dish; it waits for the restaurant before going public. */
export async function createCreatorReel(userId: string, raw: unknown) {
  const input = reelInputSchema.parse(raw);
  const c = await approvedCreator(userId);
  const today = await prisma.reel.count({ where: { creatorId: c.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (today >= DAILY_REELS) throw new CreatorError("You've posted the most reels for today. Come back tomorrow.");
  const [asset, item] = await Promise.all([
    prisma.mediaAsset.findFirst({ where: { id: input.videoAssetId, uploadedById: userId, restaurantId: null, kind: "VIDEO" } }),
    prisma.menuItem.findFirst({ where: { id: input.menuItemId, archived: false, restaurant: { status: "ACTIVE" } }, select: { id: true, restaurantId: true } }),
  ]);
  if (!asset || asset.storageKey === "stream:pending") throw new CreatorError("The video upload didn't finish. Please upload it again.");
  if (!item) throw new CreatorError("Choose the dish in your reel", "menuItemId");
  if (await prisma.reel.findFirst({ where: { videoAssetId: asset.id }, select: { id: true } })) throw new CreatorError("This video is already used by another reel");
  if (await prisma.restaurantCreatorBlock.findUnique({ where: { restaurantId_creatorId: { restaurantId: item.restaurantId, creatorId: c.id } } })) throw new CreatorError("This restaurant doesn't accept tags from you", "menuItemId");
  if (await worksAt(userId, item.restaurantId)) throw new CreatorError(OWN_RESTAURANT, "menuItemId");
  // Their own image only. Kept when the video finishes processing (it replaces the automatic one).
  const poster = input.posterAssetId ? await prisma.mediaAsset.findFirst({ where: { id: input.posterAssetId, uploadedById: userId, restaurantId: null, kind: "IMAGE" }, select: { url: true } }) : null;
  const reel = await prisma.reel.create({
    data: { restaurantId: item.restaurantId, menuItemId: item.id, videoAssetId: asset.id, creatorId: c.id, posterUrl: poster?.url ?? null, tagStatus: "PENDING", paidPartnership: input.paidPartnership, caption: input.caption?.trim() || null, status: "PROCESSING", visibility: "DRAFT", autoPublish: false },
  });
  if (isStreamKey(asset.storageKey)) await syncStreamReels({ reelId: reel.id });
  else await enqueue("process_video", { reelId: reel.id, publish: "0" });
  await audit({ actorId: userId, action: "creator.reel_create", entityType: "reel", entityId: reel.id });
  return reel;
}

/**
 * Called when a creator's video has finished processing (and after a re-tag): the restaurant is
 * asked to review it, or, if it already accepted, the reel goes live.
 */
export async function creatorReelReady(reelId: string) {
  const r = await prisma.reel.findUnique({ where: { id: reelId }, include: { creator: true, menuItem: { select: { name: true } } } });
  if (!r?.creator || r.status !== "READY") return;
  if (r.tagStatus === "ACCEPTED" && r.visibility === "DRAFT") return publishCreatorReel(r.id);
  if (r.tagStatus !== "PENDING" || r.tagRequestedAt) return;
  const { count } = await prisma.reel.updateMany({ where: { id: r.id, tagStatus: "PENDING", tagRequestedAt: null }, data: { tagRequestedAt: new Date() } });
  if (!count) return; // another process asked already
  const title = { k: "@{handle} tagged your {dish}", v: { handle: r.creator.handle, dish: r.menuItem.name } };
  const body = "Watch the reel and accept it or decline it.";
  await notifyRestaurant(r.restaurantId, { type: "creator_tag", title, body, link: "/dashboard/creator-reels" });
  void pushToRestaurantStaff(r.restaurantId, (t) => ({ title: t(title.k, title.v), body: t(body), url: "/dashboard/creator-reels", tag: `creator-tag-${r.id}` }));
}

async function publishCreatorReel(reelId: string) {
  const r = await prisma.reel.update({ where: { id: reelId }, data: { visibility: "PUBLISHED", publishedAt: new Date() }, select: { id: true, creatorId: true } });
  if (r.creatorId) void notifyCreatorFollowers(r.creatorId, r.id);
}

/** The restaurant accepts (the reel goes live) or declines a creator's tag. */
export async function decideTag(restaurantId: string, userId: string, reelId: string, accept: boolean, note?: string) {
  const r = await prisma.reel.findFirst({ where: { id: reelId, restaurantId, creatorId: { not: null }, tagStatus: "PENDING" }, include: { creator: { include: { user: { select: { locale: true } } } }, restaurant: { select: { displayName: true } }, menuItem: { select: { name: true } } } });
  if (!r || !r.creator) throw new CreatorError("This tag was already answered");
  if (accept && r.status !== "READY") throw new CreatorError("Wait for the video to finish processing");
  // Someone who works here now (e.g. hired after tagging) can't be a "creator" for this restaurant.
  if (accept && (await worksAt(r.creator.userId, restaurantId))) throw new CreatorError("This creator works at your restaurant, so their reel can't go live as a creator reel.");
  await prisma.reel.update({ where: { id: r.id }, data: { tagStatus: accept ? "ACCEPTED" : "DECLINED", tagDecidedAt: new Date(), tagNote: accept ? null : note?.trim().slice(0, 300) || null } });
  if (accept) await publishCreatorReel(r.id);
  await audit({ actorId: userId, action: accept ? "creator.tag_accept" : "creator.tag_decline", entityType: "reel", entityId: r.id, data: { note } });
  const title = accept ? { k: "{restaurant} approved your reel 🎉", v: { restaurant: r.restaurant.displayName } } : { k: "{restaurant} declined your tag", v: { restaurant: r.restaurant.displayName } };
  const body = accept ? { k: "It's live with an Order button for {dish}.", v: { dish: r.menuItem.name } } : note?.trim() || null;
  await notifyUser(r.creator.userId, { type: accept ? "creator_tag_accepted" : "creator_tag_declined", title, body, link: "/creator" });
  void pushInLanguages([{ id: r.creator.userId, locale: r.creator.user.locale }], (t) => ({ title: t(title.k, title.v), body: body == null ? "" : typeof body === "string" ? body : t(body.k, body.v), url: "/creator", tag: `creator-tag-${r.id}` }));
}

/** The restaurant takes an accepted creator reel off its dish (it leaves the feed). */
export async function removeTag(restaurantId: string, userId: string, reelId: string, note?: string) {
  const r = await prisma.reel.findFirst({ where: { id: reelId, restaurantId, creatorId: { not: null }, tagStatus: "ACCEPTED" }, include: { creator: true, restaurant: { select: { displayName: true } } } });
  if (!r || !r.creator) throw new CreatorError("This reel isn't tagged anymore");
  await prisma.reel.update({ where: { id: r.id }, data: { tagStatus: "REMOVED", tagDecidedAt: new Date(), tagNote: note?.trim().slice(0, 300) || null, visibility: "UNPUBLISHED", pinnedAt: null } });
  await audit({ actorId: userId, action: "creator.tag_remove", entityType: "reel", entityId: r.id, data: { note } });
  await notifyUser(r.creator.userId, { type: "creator_tag_removed", title: { k: "{restaurant} removed your tag", v: { restaurant: r.restaurant.displayName } }, body: note?.trim() || null, link: "/creator" });
}

/** A restaurant stops a creator from tagging it: pending tags are declined, live ones removed. */
export async function setCreatorBlocked(restaurantId: string, userId: string, creatorId: string, block: boolean) {
  if (block) {
    await prisma.$transaction([
      prisma.restaurantCreatorBlock.upsert({ where: { restaurantId_creatorId: { restaurantId, creatorId } }, create: { restaurantId, creatorId }, update: {} }),
      prisma.reel.updateMany({ where: { restaurantId, creatorId, tagStatus: "PENDING" }, data: { tagStatus: "DECLINED", tagDecidedAt: new Date() } }),
      prisma.reel.updateMany({ where: { restaurantId, creatorId, tagStatus: "ACCEPTED" }, data: { tagStatus: "REMOVED", tagDecidedAt: new Date(), visibility: "UNPUBLISHED", pinnedAt: null } }),
    ]);
  } else await prisma.restaurantCreatorBlock.deleteMany({ where: { restaurantId, creatorId } });
  await audit({ actorId: userId, action: block ? "creator.block" : "creator.unblock", entityType: "Creator", entityId: creatorId, data: { restaurantId } });
}

/** Tags another dish (after a decline, removal or expiry): asks that restaurant again. */
export async function retagReel(userId: string, reelId: string, menuItemId: string, paidPartnership: boolean) {
  const c = await approvedCreator(userId);
  const r = await prisma.reel.findFirst({ where: { id: reelId, creatorId: c.id } });
  if (!r) throw new CreatorError("Reel not found");
  if (r.tagStatus === "PENDING" || r.tagStatus === "ACCEPTED") throw new CreatorError("This reel is already tagged");
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, archived: false, restaurant: { status: "ACTIVE" } }, select: { id: true, restaurantId: true } });
  if (!item) throw new CreatorError("Choose the dish in your reel", "menuItemId");
  if (await prisma.restaurantCreatorBlock.findUnique({ where: { restaurantId_creatorId: { restaurantId: item.restaurantId, creatorId: c.id } } })) throw new CreatorError("This restaurant doesn't accept tags from you", "menuItemId");
  if (await worksAt(userId, item.restaurantId)) throw new CreatorError(OWN_RESTAURANT, "menuItemId");
  await prisma.reel.update({ where: { id: r.id }, data: { restaurantId: item.restaurantId, menuItemId: item.id, paidPartnership, tagStatus: "PENDING", tagRequestedAt: null, tagDecidedAt: null, tagNote: null, visibility: "DRAFT", pinnedAt: null } });
  await creatorReelReady(r.id);
}

export async function deleteCreatorReel(userId: string, reelId: string) {
  const c = await prisma.creator.findUnique({ where: { userId } });
  const r = c && (await prisma.reel.findFirst({ where: { id: reelId, creatorId: c.id }, include: { videoAsset: { select: { storageKey: true } } } }));
  if (!r) throw new CreatorError("Reel not found");
  await prisma.reel.delete({ where: { id: r.id } });
  const uid = streamUidOf(r.videoAsset.storageKey);
  if (uid && uid !== "pending") await deleteStreamVideo(uid).catch((e) => console.error("stream delete", e));
  await audit({ actorId: userId, action: "creator.reel_delete", entityType: "reel", entityId: r.id });
}

/** Pins a live reel at the top of the creator's grid (up to PIN_MAX), or unpins it. */
export async function pinReel(userId: string, reelId: string, pin: boolean) {
  const c = await approvedCreator(userId);
  const r = await prisma.reel.findFirst({ where: { id: reelId, creatorId: c.id } });
  if (!r) throw new CreatorError("Reel not found");
  if (!pin) return prisma.reel.update({ where: { id: r.id }, data: { pinnedAt: null } });
  if (r.tagStatus !== "ACCEPTED" || r.visibility !== "PUBLISHED") throw new CreatorError("Only live reels can be pinned");
  const pinned = await prisma.reel.count({ where: { creatorId: c.id, pinnedAt: { not: null }, id: { not: r.id } } });
  if (pinned >= PIN_MAX) throw new CreatorError("You can pin up to 6 reels. Unpin one first.");
  return prisma.reel.update({ where: { id: r.id }, data: { pinnedAt: new Date() } });
}

/** Tags the restaurant didn't answer within TAG_DAYS expire (the creator can tag again). Never throws. */
const REMIND_AFTER_DAYS = 3;

/**
 * Hourly (cron): a restaurant that hasn't answered a creator's tag after 3 days is reminded once;
 * after TAG_DAYS the tag expires and the creator is told. Never throws.
 */
export async function expireCreatorTags(now = new Date()) {
  try {
    const due = await prisma.reel.findMany({
      where: { tagStatus: "PENDING", tagRemindedAt: null, tagRequestedAt: { lt: new Date(now.getTime() - REMIND_AFTER_DAYS * 86400_000), gte: new Date(now.getTime() - TAG_DAYS * 86400_000) } },
      select: { id: true, restaurantId: true, tagRequestedAt: true, creator: { select: { handle: true } }, menuItem: { select: { name: true } } },
      take: 500,
    });
    for (const r of due) {
      const { count } = await prisma.reel.updateMany({ where: { id: r.id, tagRemindedAt: null }, data: { tagRemindedAt: now } });
      if (!count || !r.creator) continue;
      const left = Math.max(1, Math.ceil((r.tagRequestedAt!.getTime() + TAG_DAYS * 86400_000 - now.getTime()) / 86400_000));
      const title = { k: "@{handle} is waiting for your answer", v: { handle: r.creator.handle } };
      const body = { k: "Approve or decline their reel of {dish}: {n} days left before it expires.", v: { dish: r.menuItem.name, n: left } };
      await notifyRestaurant(r.restaurantId, { type: "creator_tag_reminder", title, body, link: "/dashboard/creator-reels" });
      void pushToRestaurantStaff(r.restaurantId, (t) => ({ title: t(title.k, title.v), body: t(body.k, body.v), url: "/dashboard/creator-reels", tag: `creator-tag-${r.id}` })).catch(() => 0);
    }
    const old = await prisma.reel.findMany({ where: { tagStatus: "PENDING", tagRequestedAt: { lt: new Date(now.getTime() - TAG_DAYS * 86400_000) } }, select: { id: true, creator: { select: { userId: true } }, restaurant: { select: { displayName: true } } }, take: 500 });
    for (const r of old) {
      const { count } = await prisma.reel.updateMany({ where: { id: r.id, tagStatus: "PENDING" }, data: { tagStatus: "EXPIRED", tagDecidedAt: now } });
      if (count && r.creator) await notifyUser(r.creator.userId, { type: "creator_tag_expired", title: { k: "{restaurant} didn't answer your tag", v: { restaurant: r.restaurant.displayName } }, body: "You can tag it again or tag another dish.", link: "/creator" });
    }
    return old.length;
  } catch (e) {
    console.error("expireCreatorTags", e);
    return 0;
  }
}

// ───── Following creators ─────

export async function setCreatorFollow(userId: string, creatorId: string, follow: boolean): Promise<{ following: boolean; followerCount: number }> {
  let isNew = false;
  const result = await prisma.$transaction(async (tx) => {
    const c = await tx.creator.findFirst({ where: { id: creatorId, status: "APPROVED" }, select: { id: true, userId: true } });
    if (!c) throw new CreatorError("Creator not found");
    if (c.userId === userId) throw new CreatorError("You can't follow yourself");
    const existing = await tx.creatorFollow.findUnique({ where: { userId_creatorId: { userId, creatorId } } });
    if (follow && !existing) {
      isNew = true;
      await tx.creatorFollow.create({ data: { userId, creatorId } });
      await tx.creator.update({ where: { id: creatorId }, data: { followerCount: { increment: 1 } } });
    } else if (!follow && existing) {
      await tx.creatorFollow.delete({ where: { userId_creatorId: { userId, creatorId } } });
      await tx.creator.updateMany({ where: { id: creatorId, followerCount: { gt: 0 } }, data: { followerCount: { decrement: 1 } } });
    }
    const { followerCount } = await tx.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { followerCount: true } });
    return { following: follow, followerCount };
  });
  if (isNew) await notifyNewFollower(creatorId, userId);
  return result;
}

/** "Rana Haddad" → "Rana H." (how a follower is shown to the creator). */
export function followerName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.length ? rest[rest.length - 1] : "";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

const REFOLLOW_QUIET_MS = 7 * 86400_000; // unfollow + follow again: no second notification for a week
const FOLLOW_PUSH_GAP_MS = 2 * 60_000; // a burst of follows: one push, the rest wait in the inbox

/**
 * The creator hears about a new follower at once: in Notifications, and on the phone. Never throws.
 */
export async function notifyNewFollower(creatorId: string, followerId: string) {
  try {
    const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { userId: true, user: { select: { locale: true } } } });
    const f = await prisma.user.findUnique({ where: { id: followerId }, select: { name: true } });
    if (!c || !f) return;
    const link = `/creator/followers?f=${followerId}`; // also how a repeat is recognised
    const recent = await prisma.notification.findFirst({ where: { audience: "USER", userId: c.userId, type: "creator_new_follower", link, createdAt: { gt: new Date(Date.now() - REFOLLOW_QUIET_MS) } }, select: { id: true } });
    if (recent) return;
    const lastPush = await prisma.notification.findFirst({ where: { audience: "USER", userId: c.userId, type: "creator_new_follower", createdAt: { gt: new Date(Date.now() - FOLLOW_PUSH_GAP_MS) } }, select: { id: true } });
    // The name is isolated so "Rana H." keeps its full stop in place inside Arabic text.
    const title = { k: "{name} started following you", v: { name: `\u2068${followerName(f.name)}\u2069` } };
    await notifyUser(c.userId, { type: "creator_new_follower", title, link });
    if (!lastPush) void pushInLanguages([{ id: c.userId, locale: c.user.locale }], (t) => ({ title: t(title.k, title.v), body: t("Tap to see your followers."), url: "/creator/followers", tag: `followers-${creatorId}` })).catch(() => 0);
  } catch (e) {
    console.error("notifyNewFollower", e);
  }
}

/** Followers hear about a creator's new live reel: at most one notification per NOTIFY_GAP, in batches. Never throws. */
export async function notifyCreatorFollowers(creatorId: string, reelId: string) {
  try {
    const r = await prisma.reel.findUnique({ where: { id: reelId }, select: { posterUrl: true, creator: { select: { handle: true } }, menuItem: { select: { name: true } }, restaurant: { select: { displayName: true } } } });
    if (!r?.creator) return 0;
    const title = { k: "@{handle} posted a new reel", v: { handle: r.creator.handle } };
    const body = { k: "{dish} at {restaurant}", v: { dish: r.menuItem.name, restaurant: r.restaurant.displayName } };
    const link = `/reel/${reelId}`;
    const since = new Date(Date.now() - NOTIFY_GAP_MS);
    let total = 0;
    let after: string | undefined;
    for (;;) {
      const followers = await prisma.creatorFollow.findMany({
        where: { creatorId, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: since } }], user: { disabled: false }, ...(after ? { userId: { gt: after } } : {}) },
        select: { userId: true, user: { select: { locale: true } } },
        orderBy: { userId: "asc" },
        take: BATCH,
      });
      if (!followers.length) break;
      after = followers[followers.length - 1].userId;
      const ids = followers.map((f) => f.userId);
      await prisma.creatorFollow.updateMany({ where: { creatorId, userId: { in: ids } }, data: { lastNotifiedAt: new Date() } });
      await prisma.notification.createMany({ data: ids.map((userId) => ({ audience: "USER", userId, type: "follow_creator_reel", title: encodeText(title), body: encodeText(body), link, imageUrl: r.posterUrl })) });
      await pushInLanguages(followers.map((f) => ({ id: f.userId, locale: f.user.locale })), (t) => ({ title: t(title.k, title.v), body: t(body.k, body.v), url: link, tag: `creator-${creatorId}`, image: r.posterUrl ?? undefined }));
      total += ids.length;
      if (followers.length < BATCH) break;
    }
    return total;
  } catch (e) {
    console.error("notifyCreatorFollowers", e);
    return 0;
  }
}

/** Reels on a creator's public profile: pinned first (newest pin first), then newest. */
export const creatorGridOrder: Prisma.ReelOrderByWithRelationInput[] = [{ pinnedAt: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }, { id: "desc" }];

/**
 * Restaurants a creator can film and tag: active, with a menu, not blocking them, and not one they
 * work at. Busiest first (the page puts the nearest first when it knows where the creator is).
 */
export async function restaurantsForCreator(userId: string) {
  const c = await prisma.creator.findUnique({ where: { userId }, select: { id: true } });
  if (!c) return [];
  const rows = await prisma.restaurant.findMany({
    where: { status: "ACTIVE", menuItems: { some: { archived: false } }, creatorBlocks: { none: { creatorId: c.id } }, staff: { none: { userId } } },
    select: {
      id: true,
      slug: true,
      displayName: true,
      logoUrl: true,
      cuisine: true,
      area: true,
      city: true,
      latitude: true,
      longitude: true,
      verificationStatus: true,
      _count: { select: { menuItems: { where: { archived: false } }, reels: { where: { creatorId: { not: null }, tagStatus: "ACCEPTED" } } } },
    },
    orderBy: [{ totalReelViews: "desc" }, { displayName: "asc" }],
    take: 500,
  });
  return rows.map(({ _count, ...r }) => ({ ...r, dishes: _count.menuItems, creatorReels: _count.reels }));
}

/**
 * Dishes a creator can tag, by dish or restaurant name (restaurants that blocked them are left out;
 * dishes of a restaurant they work at are marked `own`: shown, but can't be tagged).
 */
export async function dishesToTag(userId: string, q: string) {
  const c = await prisma.creator.findUnique({ where: { userId }, select: { id: true } });
  const term = String(q ?? "").trim().slice(0, 60);
  if (!c || term.length < 2) return [];
  const items = await prisma.menuItem.findMany({
    where: {
      archived: false,
      restaurant: { status: "ACTIVE", creatorBlocks: { none: { creatorId: c.id } } },
      OR: [{ name: { contains: term, mode: "insensitive" } }, { restaurant: { displayName: { contains: term, mode: "insensitive" } } }],
    },
    select: { id: true, name: true, priceCents: true, currency: true, restaurant: { select: { displayName: true, logoUrl: true, area: true, staff: { where: { userId }, select: { id: true }, take: 1 } } }, images: { where: { isMain: true }, take: 1, select: { asset: { select: { thumbUrl: true, url: true } } } } },
    orderBy: [{ restaurant: { displayName: "asc" } }, { name: "asc" }],
    take: 30,
  });
  return items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, currency: i.currency, restaurant: i.restaurant.displayName, area: i.restaurant.area, logoUrl: i.restaurant.logoUrl, imageUrl: i.images[0]?.asset.thumbUrl ?? i.images[0]?.asset.url ?? null, own: i.restaurant.staff.length > 0 }));
}

/**
 * A creator's reel just brought its first order: tell the creator (once per reel). Called after an
 * order is placed from reels; never throws.
 */
export async function celebrateFirstCreatorOrders(reelIds: string[]) {
  try {
    const firsts = await prisma.reel.findMany({ where: { id: { in: reelIds }, creatorId: { not: null }, orderInits: 1 }, select: { id: true, menuItem: { select: { name: true } }, restaurant: { select: { displayName: true } }, creator: { select: { userId: true, user: { select: { locale: true } } } } } });
    for (const r of firsts) {
      if (!r.creator) continue;
      const link = `/creator/insights?reel=${r.id}`;
      if (await prisma.notification.findFirst({ where: { audience: "USER", userId: r.creator.userId, type: "creator_first_order", link }, select: { id: true } })) continue;
      const title = { k: "Your reel of {dish} got its first order 🎉", v: { dish: r.menuItem.name } };
      const body = { k: "Someone ordered from {restaurant} after watching it. Keep them coming!", v: { restaurant: r.restaurant.displayName } };
      await notifyUser(r.creator.userId, { type: "creator_first_order", title, body, link });
      void pushInLanguages([{ id: r.creator.userId, locale: r.creator.user.locale }], (t) => ({ title: t(title.k, title.v), body: t(body.k, body.v), url: link, tag: `first-order-${r.id}` })).catch(() => 0);
    }
  } catch (e) {
    console.error("celebrateFirstCreatorOrders", e);
  }
}
