import { Readable } from "node:stream";
import { prisma } from "@/server/db";
import { getBlob, statLocal, streamLocal } from "@/server/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", webm: "video/webm" };
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * /media/i/<assetId>.webp and /media/i/<assetId>_t.webp → images stored in the database.
 * Anything else → local video files (only used when Cloudflare Stream isn't configured),
 * with HTTP Range support (required for iOS Safari).
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const parts = (await params).key;
  if (parts[0] === "i" && parts.length === 2) {
    const m = parts[1].match(/^([a-z0-9]{20,40})(_t)?\.webp$/);
    if (!m) return new Response("Not found", { status: 404 });
    const asset = await prisma.mediaAsset.findUnique({ where: { id: m[1] }, select: { isPrivate: true } });
    if (!asset || asset.isPrivate) return new Response("Not found", { status: 404 });
    const data = await getBlob(m[1], m[2] ? "thumb" : "main");
    if (!data) return new Response("Not found", { status: 404 });
    if (req.headers.get("if-none-match") === `"${parts[1]}"`) return new Response(null, { status: 304, headers: { etag: `"${parts[1]}"`, "cache-control": IMMUTABLE } });
    return new Response(new Uint8Array(data), { headers: { "content-type": "image/webp", "content-length": String(data.byteLength), "cache-control": IMMUTABLE, etag: `"${parts[1]}"`, "x-content-type-options": "nosniff" } });
  }

  const key = parts.join("/");
  if (key.includes("..") || key.includes("/raw/")) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = (await statLocal(key, false)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": IMMUTABLE, "x-content-type-options": "nosniff" };
  const range = req.headers.get("range");
  if (range) {
    const mm = range.match(/bytes=(\d*)-(\d*)/);
    if (!mm) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    let start = mm[1] ? Number(mm[1]) : NaN;
    let end = mm[2] ? Number(mm[2]) : NaN;
    if (Number.isNaN(start)) {
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(Readable.toWeb(streamLocal(key, false, { start, end })) as ReadableStream, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(streamLocal(key, false)) as ReadableStream, { headers: { ...base, "content-length": String(size) } });
}
