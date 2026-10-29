import { Readable } from "node:stream";
import { statLocal, streamLocal } from "@/server/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", webm: "video/webm" };

/** Serves public local media with HTTP Range support (required for iOS Safari video). Put a CDN in front in production. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (key.includes("..") || key.includes("/raw/")) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = (await statLocal(key, false)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" };
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (!m) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    let start = m[1] ? Number(m[1]) : NaN;
    let end = m[2] ? Number(m[2]) : NaN;
    if (Number.isNaN(start)) {
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(Readable.toWeb(streamLocal(key, false, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(streamLocal(key, false)) as ReadableStream, { headers: { ...base, "content-length": String(size) } });
}
