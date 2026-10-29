"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireRestaurant } from "@/server/auth";
import { enqueue } from "@/server/jobs";
import { audit } from "@/server/audit";
import type { ActionResult } from "./menu";

async function ownReel(id: string) {
  const ctx = await requireRestaurant("MANAGER");
  const reel = await prisma.reel.findFirst({ where: { id, restaurantId: ctx.restaurant.id } });
  if (!reel) throw new Error("Reel not found");
  return { ctx, reel };
}

export async function createReelAction(input: { videoAssetId: string; menuItemId: string; caption?: string; posterAssetId?: string | null; publish: boolean }): Promise<ActionResult<string>> {
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  if (r.restrictReels) return { ok: false, error: "New reels are restricted on your account until outstanding invoices are settled." };
  const [asset, item] = await Promise.all([
    prisma.mediaAsset.findFirst({ where: { id: input.videoAssetId, restaurantId: r.id, kind: "VIDEO" } }),
    prisma.menuItem.findFirst({ where: { id: input.menuItemId, restaurantId: r.id, archived: false } }),
  ]);
  if (!asset) return { ok: false, error: "Upload a video first" };
  if (!item) return { ok: false, error: "Choose a menu item to link this reel to" };
  if (await prisma.reel.findFirst({ where: { videoAssetId: asset.id } })) return { ok: false, error: "This video is already used by another reel" };
  let posterUrl: string | null = null;
  if (input.posterAssetId) {
    const p = await prisma.mediaAsset.findFirst({ where: { id: input.posterAssetId, restaurantId: r.id, kind: "IMAGE" } });
    posterUrl = p?.url ?? null;
  }
  const reel = await prisma.reel.create({
    data: { restaurantId: r.id, menuItemId: item.id, videoAssetId: asset.id, caption: input.caption?.trim().slice(0, 300) || null, posterUrl, status: "PROCESSING", visibility: "DRAFT" },
  });
  await enqueue("process_video", { reelId: reel.id, publish: input.publish && r.status === "ACTIVE" ? "1" : "0" });
  await audit({ actorId: ctx.user.id, action: "reel.create", entityType: "reel", entityId: reel.id });
  revalidatePath("/dashboard/reels");
  return { ok: true, data: reel.id };
}

export async function updateReelAction(id: string, input: { caption?: string; menuItemId?: string; posterAssetId?: string | null }): Promise<ActionResult> {
  try {
    const { ctx, reel } = await ownReel(id);
    const data: { caption?: string | null; menuItemId?: string; posterUrl?: string | null } = {};
    if (input.caption !== undefined) data.caption = input.caption.trim().slice(0, 300) || null;
    if (input.menuItemId && input.menuItemId !== reel.menuItemId) {
      const item = await prisma.menuItem.findFirst({ where: { id: input.menuItemId, restaurantId: ctx.restaurant.id, archived: false } });
      if (!item) return { ok: false, error: "Menu item not found" };
      data.menuItemId = item.id;
    }
    if (input.posterAssetId) {
      const p = await prisma.mediaAsset.findFirst({ where: { id: input.posterAssetId, restaurantId: ctx.restaurant.id, kind: "IMAGE" } });
      if (p) data.posterUrl = p.url;
    }
    await prisma.reel.update({ where: { id }, data });
    revalidatePath(`/dashboard/reels/${id}`);
    return { ok: true, message: "Reel updated" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setReelVisibilityAction(id: string, publish: boolean): Promise<ActionResult> {
  try {
    const { ctx, reel } = await ownReel(id);
    if (reel.visibility === "REMOVED") return { ok: false, error: "This reel was removed by moderation" };
    if (publish) {
      if (reel.status !== "READY") return { ok: false, error: "Wait for the video to finish processing" };
      if (ctx.restaurant.status !== "ACTIVE") return { ok: false, error: "Your restaurant profile must be approved before reels go live" };
      if (ctx.restaurant.restrictReels) return { ok: false, error: "Publishing reels is restricted until outstanding invoices are settled" };
    }
    await prisma.reel.update({ where: { id }, data: { visibility: publish ? "PUBLISHED" : "UNPUBLISHED", publishedAt: publish ? reel.publishedAt ?? new Date() : reel.publishedAt } });
    revalidatePath("/dashboard/reels");
    revalidatePath(`/dashboard/reels/${id}`);
    return { ok: true, message: publish ? "Reel published" : "Reel unpublished" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteReelAction(id: string): Promise<ActionResult> {
  try {
    const { ctx } = await ownReel(id);
    await prisma.reel.delete({ where: { id } });
    await audit({ actorId: ctx.user.id, action: "reel.delete", entityType: "reel", entityId: id });
    revalidatePath("/dashboard/reels");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function retryReelAction(id: string): Promise<ActionResult> {
  try {
    const { reel } = await ownReel(id);
    if (reel.status !== "FAILED") return { ok: true };
    await prisma.reel.update({ where: { id }, data: { status: "PROCESSING", processingError: null } });
    await enqueue("process_video", { reelId: id, publish: "0" });
    revalidatePath(`/dashboard/reels/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
