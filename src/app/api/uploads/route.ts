import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser, getRestaurantContext, hasRole, canAccess } from "@/server/auth";
import { errorResponse, json, limit } from "@/server/http";
import { MAX_DOC_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, processImage, storePrivateDocument, storeRawVideo, streamToTempFile } from "@/server/media";
import { attachImage } from "@/server/menu";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Raw-body uploads (streamed to disk, so large videos don't sit in memory).
 *   PUT /api/uploads?kind=image|video|receipt|document[&attachTo=<menuItemId>&index=<n>&main=1]
 *   header x-filename: original file name
 */
export async function PUT(req: Request) {
  let tmp: string | null = null;
  try {
    await limit("upload", 400, 10 * 60_000);
    const user = await getCurrentUser();
    if (!user) return json({ error: "Please log in" }, 401);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const filename = decodeURIComponent(req.headers.get("x-filename") || "upload").slice(0, 200);
    if (!req.body) return json({ error: "Empty upload" }, 400);

    // Admins can upload platform-level images (e.g. category art); everyone else uploads into their restaurant.
    const ctx = await getRestaurantContext();
    const forPlatform = url.searchParams.get("scope") === "platform" && hasRole(user, "ADMIN");
    if (!ctx && !forPlatform) return json({ error: "No restaurant account" }, 403);
    const restaurantId = forPlatform ? null : ctx!.restaurant.id;

    if (kind === "image") {
      if (ctx && !forPlatform && !canAccess(ctx.staffRole, "MANAGER")) return json({ error: "Requires manager access" }, 403);
      const { file } = await streamToTempFile(req.body, MAX_IMAGE_BYTES);
      tmp = file;
      const asset = await processImage(await fs.readFile(file), { restaurantId, originalName: filename, uploadedById: user.id });
      const attachTo = url.searchParams.get("attachTo");
      if (attachTo && restaurantId) {
        await attachImage(restaurantId, attachTo, asset.id, { index: Number(url.searchParams.get("index")) || undefined, makeMain: url.searchParams.get("main") === "1" });
      }
      return json({ id: asset.id, url: asset.url, thumbUrl: asset.thumbUrl, width: asset.width, height: asset.height }, 201);
    }
    if (!restaurantId || !ctx) return json({ error: "Invalid upload" }, 400);
    if (kind === "video") {
      if (!canAccess(ctx.staffRole, "MANAGER")) return json({ error: "Requires manager access" }, 403);
      if (ctx.restaurant.restrictReels) return json({ error: "Reel uploads are restricted on your account. Please settle outstanding invoices or contact support." }, 403);
      const { file } = await streamToTempFile(req.body, MAX_VIDEO_BYTES);
      tmp = file;
      const asset = await storeRawVideo(file, { restaurantId, originalName: filename, uploadedById: user.id });
      tmp = null; // moved into storage
      return json({ id: asset.id, sizeBytes: asset.sizeBytes }, 201);
    }
    if (kind === "receipt" || kind === "document") {
      if (kind === "receipt" && !canAccess(ctx.staffRole, "OWNER")) return json({ error: "Only the owner can submit payments" }, 403);
      const { file } = await streamToTempFile(req.body, MAX_DOC_BYTES);
      tmp = file;
      const asset = await storePrivateDocument(await fs.readFile(file), { restaurantId, originalName: filename, uploadedById: user.id, kind: kind === "receipt" ? "RECEIPT" : "DOCUMENT" });
      return json({ id: asset.id, url: asset.url, name: asset.originalName }, 201);
    }
    return json({ error: "Unknown upload kind" }, 400);
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (tmp) await fs.rm(path.dirname(tmp), { recursive: true, force: true }).catch(() => {});
  }
}
