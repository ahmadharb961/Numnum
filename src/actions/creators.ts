"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/server/db";
import { getCurrentUser, requireAdmin, requireRestaurant, requireUser } from "@/server/auth";
import { streamConfigured } from "@/server/stream";
import { rateLimit } from "@/server/rate-limit";
import {
  applyAsCreator,
  approvedCreator,
  createCreatorReel,
  CreatorError,
  decideCreator,
  decideTag,
  decideVerification,
  deleteCreatorReel,
  pinReel,
  removeTag,
  requestVerification,
  retagReel,
  setCreatorBlocked,
  setCreatorFollow,
  suspendCreator,
  updateCreatorProfile,
} from "@/server/creators";

export type CreatorResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, error: "Check the highlighted fields", fieldErrors };
  }
  if (e instanceof CreatorError) return { ok: false, error: e.message, ...(e.field ? { fieldErrors: { [e.field]: e.message } } : {}) };
  console.error("creator action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refreshCreator = (handle?: string) => {
  revalidatePath("/creator");
  revalidatePath("/account");
  if (handle) revalidatePath(`/c/${handle}`);
};

// ───── The creator ─────

export async function applyCreatorAction(input: unknown): Promise<CreatorResult> {
  const me = await requireUser("/creator/apply");
  if (!rateLimit(`creator-apply:${me.id}`, 5, 60 * 60_000).ok) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  try {
    await applyAsCreator(me.id, input);
    refreshCreator();
    return { ok: true, message: "Application sent. We'll let you know once it's reviewed." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCreatorProfileAction(input: unknown): Promise<CreatorResult> {
  const me = await requireUser("/creator");
  try {
    const c = await updateCreatorProfile(me.id, input);
    refreshCreator(c.handle);
    return { ok: true, message: "Profile saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function requestVerificationAction(note: string): Promise<CreatorResult> {
  const me = await requireUser("/creator");
  try {
    await requestVerification(me.id, String(note ?? ""));
    refreshCreator();
    return { ok: true, message: "Request sent. We'll review it soon." };
  } catch (e) {
    return fail(e);
  }
}

/** The placeholder asset a Cloudflare Stream (tus) upload attaches to (same as restaurants). */
export async function startCreatorStreamUploadAction(fileName: string, sizeBytes: number): Promise<CreatorResult<string>> {
  const me = await requireUser("/creator");
  try {
    await approvedCreator(me.id);
    if (!streamConfigured()) return { ok: false, error: "Video uploads are not configured" };
    const asset = await prisma.mediaAsset.create({
      data: { restaurantId: null, kind: "VIDEO", isPrivate: false, storageKey: "stream:pending", url: "", mimeType: "video/*", sizeBytes: Math.max(0, Math.round(sizeBytes)), originalName: String(fileName).slice(0, 200), uploadedById: me.id },
    });
    return { ok: true, data: asset.id };
  } catch (e) {
    return fail(e);
  }
}

export async function createCreatorReelAction(input: unknown): Promise<CreatorResult<string>> {
  const me = await requireUser("/creator");
  try {
    const reel = await createCreatorReel(me.id, input);
    refreshCreator();
    return { ok: true, data: reel.id, message: "Reel posted. The restaurant will review the tag." };
  } catch (e) {
    return fail(e);
  }
}

export async function retagReelAction(reelId: string, menuItemId: string, paidPartnership: boolean): Promise<CreatorResult> {
  const me = await requireUser("/creator");
  try {
    await retagReel(me.id, reelId, menuItemId, !!paidPartnership);
    refreshCreator();
    return { ok: true, message: "Tag sent. The restaurant will review it." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCreatorReelAction(reelId: string): Promise<CreatorResult> {
  const me = await requireUser("/creator");
  try {
    await deleteCreatorReel(me.id, reelId);
    const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { handle: true } });
    refreshCreator(c?.handle);
    return { ok: true, message: "Reel deleted" };
  } catch (e) {
    return fail(e);
  }
}

export async function pinReelAction(reelId: string, pin: boolean): Promise<CreatorResult> {
  const me = await requireUser("/creator");
  try {
    await pinReel(me.id, reelId, pin);
    const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { handle: true } });
    refreshCreator(c?.handle);
    return { ok: true, message: pin ? "Pinned to your profile" : "Unpinned" };
  } catch (e) {
    return fail(e);
  }
}

/** Dishes to tag, by dish or restaurant name (restaurants that blocked this creator are left out). */
export async function searchDishesAction(q: string) {
  const me = await requireUser("/creator");
  const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { id: true } });
  const term = String(q ?? "").trim().slice(0, 60);
  if (!c || term.length < 2) return [];
  const items = await prisma.menuItem.findMany({
    where: {
      archived: false,
      restaurant: { status: "ACTIVE", creatorBlocks: { none: { creatorId: c.id } } },
      OR: [{ name: { contains: term, mode: "insensitive" } }, { restaurant: { displayName: { contains: term, mode: "insensitive" } } }],
    },
    select: { id: true, name: true, priceCents: true, currency: true, restaurant: { select: { displayName: true, logoUrl: true, area: true } }, images: { where: { isMain: true }, take: 1, select: { asset: { select: { thumbUrl: true, url: true } } } } },
    orderBy: [{ restaurant: { displayName: "asc" } }, { name: "asc" }],
    take: 30,
  });
  return items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, currency: i.currency, restaurant: i.restaurant.displayName, area: i.restaurant.area, logoUrl: i.restaurant.logoUrl, imageUrl: i.images[0]?.asset.thumbUrl ?? i.images[0]?.asset.url ?? null }));
}

export async function followCreatorAction(creatorId: string, follow: boolean): Promise<{ ok: true; following: boolean; followerCount: number } | { ok: false; login: boolean; error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, login: true };
  try {
    const r = await setCreatorFollow(me.id, creatorId, follow);
    const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { handle: true } });
    if (c) revalidatePath(`/c/${c.handle}`);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, login: false, error: e instanceof CreatorError ? e.message : undefined };
  }
}

// ───── The restaurant ─────

export async function decideTagAction(reelId: string, accept: boolean, note?: string): Promise<CreatorResult> {
  const ctx = await requireRestaurant("MANAGER");
  try {
    await decideTag(ctx.restaurant.id, ctx.user.id, reelId, accept, note);
    revalidatePath("/dashboard/creator-reels");
    return { ok: true, message: accept ? "Accepted: the reel is live" : "Declined" };
  } catch (e) {
    return fail(e);
  }
}

export async function removeTagAction(reelId: string, note?: string): Promise<CreatorResult> {
  const ctx = await requireRestaurant("MANAGER");
  try {
    await removeTag(ctx.restaurant.id, ctx.user.id, reelId, note);
    revalidatePath("/dashboard/creator-reels");
    return { ok: true, message: "Removed from your dish" };
  } catch (e) {
    return fail(e);
  }
}

export async function blockCreatorAction(creatorId: string, block: boolean): Promise<CreatorResult> {
  const ctx = await requireRestaurant("MANAGER");
  try {
    await setCreatorBlocked(ctx.restaurant.id, ctx.user.id, creatorId, block);
    revalidatePath("/dashboard/creator-reels");
    return { ok: true, message: block ? "Blocked: they can't tag you anymore" : "Unblocked" };
  } catch (e) {
    return fail(e);
  }
}

// ───── Admin ─────

export async function decideCreatorAction(creatorId: string, approve: boolean, note?: string): Promise<CreatorResult> {
  const admin = await requireAdmin();
  try {
    const c = await decideCreator(admin.id, creatorId, approve, note);
    revalidatePath("/admin/creators");
    revalidatePath(`/c/${c.handle}`);
    return { ok: true, message: approve ? "Approved: welcome email sent" : "Declined" };
  } catch (e) {
    return fail(e);
  }
}

export async function suspendCreatorAction(creatorId: string, suspend: boolean, note?: string): Promise<CreatorResult> {
  const admin = await requireAdmin();
  try {
    const c = await suspendCreator(admin.id, creatorId, suspend, note);
    revalidatePath("/admin/creators");
    revalidatePath(`/c/${c.handle}`);
    return { ok: true, message: suspend ? "Suspended: their reels left the feed" : "Restored" };
  } catch (e) {
    return fail(e);
  }
}

export async function decideVerificationAction(creatorId: string, approve: boolean, note?: string): Promise<CreatorResult> {
  const admin = await requireAdmin();
  try {
    const c = await decideVerification(admin.id, creatorId, approve, note);
    revalidatePath("/admin/creators");
    revalidatePath(`/c/${c.handle}`);
    return { ok: true, message: approve ? "Verified" : "Declined" };
  } catch (e) {
    return fail(e);
  }
}
