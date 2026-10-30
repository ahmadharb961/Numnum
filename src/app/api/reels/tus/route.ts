import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getRestaurantContext, canAccess } from "@/server/auth";
import { createTusUpload, parseTusMetadata, STREAM_MAX_BYTES } from "@/server/stream";

export const runtime = "nodejs";

/**
 * tus "create upload" endpoint. The browser's tus client calls this first; we ask
 * Cloudflare for a one-time upload URL and return it in the Location header. The
 * file then goes from the phone straight to Cloudflare, resuming on bad connections.
 */
export async function POST(req: NextRequest) {
  const ctx = await getRestaurantContext();
  if (!ctx || !canAccess(ctx.staffRole, "MANAGER")) return new NextResponse("Unauthorized", { status: 401 });
  if (ctx.restaurant.restrictReels) return new NextResponse("Reel uploads are restricted on this account", { status: 403 });
  const assetId = req.nextUrl.searchParams.get("assetId") ?? "";
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, restaurantId: ctx.restaurant.id, kind: "VIDEO", storageKey: "stream:pending" } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const length = req.headers.get("upload-length") ?? "";
  if (!/^\d+$/.test(length) || Number(length) <= 0) return new NextResponse("Upload-Length required", { status: 400 });
  if (Number(length) > STREAM_MAX_BYTES) return new NextResponse("File too large", { status: 413 });
  const meta = parseTusMetadata(req.headers.get("upload-metadata"));
  try {
    const { location, uid } = await createTusUpload({ uploadLength: length, fileName: meta.filename ?? meta.name ?? "reel.mp4", creator: ctx.restaurant.id });
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { storageKey: `stream:${uid}`, sizeBytes: Number(length), originalName: (meta.filename ?? "").slice(0, 200) || null } });
    return new NextResponse(null, { status: 201, headers: { Location: location, "Tus-Resumable": "1.0.0", "Access-Control-Expose-Headers": "Location" } });
  } catch (e) {
    console.error("tus create failed", e);
    return new NextResponse("Upload service unavailable", { status: 502 });
  }
}
