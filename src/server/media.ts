import "server-only";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp, { type Metadata as SharpMetadata } from "sharp";
import type { MediaKind } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { driver, moveLocal, putLocal, uploadCloudinary, localPath } from "./storage";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export class MediaError extends Error {
  status = 400;
}

/** Validate & normalize an image: auto-rotate, strip metadata, resize without distortion, WebP output. */
export async function processImage(
  input: Buffer,
  opts: { restaurantId: string | null; originalName?: string; uploadedById?: string; kind?: MediaKind; isPrivate?: boolean; maxSize?: number },
) {
  if (input.byteLength > MAX_IMAGE_BYTES) throw new MediaError("Image is larger than 15 MB");
  let meta: SharpMetadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    const lower = (opts.originalName || "").toLowerCase();
    if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
      throw new MediaError("HEIC images can't be converted on this server. Please export as JPG (iPhone: Settings → Camera → Formats → Most Compatible)");
    }
    throw new MediaError("Unsupported or corrupted image. Use JPG, PNG or WebP");
  }
  const allowed = ["jpeg", "png", "webp", "heif", "avif", "gif"];
  if (!meta.format || !allowed.includes(meta.format)) throw new MediaError("Unsupported image format. Use JPG, PNG or WebP");
  if ((meta.width ?? 0) * (meta.height ?? 0) > 60_000_000) throw new MediaError("Image dimensions are too large");

  const checksum = sha256(input);
  if (opts.restaurantId && !opts.isPrivate && (opts.kind ?? "IMAGE") === "IMAGE") {
    // identical file already uploaded by this restaurant → reuse it
    const dup = await prisma.mediaAsset.findFirst({ where: { restaurantId: opts.restaurantId, kind: "IMAGE", checksum } });
    if (dup) return dup;
  }
  const maxSize = opts.maxSize ?? 1600;
  const base = sharp(input, { failOn: "error" }).rotate(); // apply EXIF orientation; metadata stripped by default
  const main = await base.clone().resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();

  const kind = opts.kind ?? "IMAGE";
  const isPrivate = !!opts.isPrivate;
  const id = randomToken(12);
  const folder = `${kind.toLowerCase()}/${opts.restaurantId ?? "platform"}`;
  let url: string, thumbUrl: string | null;
  let storageKey = `${folder}/${id}.webp`;

  if (!isPrivate && driver() === "cloudinary") {
    const up = await uploadCloudinary(main.data, "image", `numnum/${folder}/${id}`);
    url = up.url;
    thumbUrl = up.thumbUrl ?? null;
    storageKey = `cloudinary:numnum/${folder}/${id}`;
  } else {
    url = await putLocal(storageKey, main.data, isPrivate);
    thumbUrl = await putLocal(`${folder}/${id}_thumb.webp`, thumb, isPrivate);
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      restaurantId: opts.restaurantId,
      kind,
      isPrivate,
      storageKey,
      url,
      thumbUrl: thumbUrl || null,
      mimeType: "image/webp",
      sizeBytes: main.data.byteLength,
      width: main.info.width,
      height: main.info.height,
      originalName: opts.originalName?.slice(0, 200),
      checksum,
      uploadedById: opts.uploadedById,
    },
  });
  if (isPrivate && !asset.url) {
    return prisma.mediaAsset.update({ where: { id: asset.id }, data: { url: `/api/private-media/${asset.id}`, thumbUrl: `/api/private-media/${asset.id}?thumb=1` } });
  }
  return asset;
}

/** Private documents (receipts, verification docs). Images are normalized; PDFs are stored as-is after a magic-byte check. */
export async function storePrivateDocument(input: Buffer, opts: { restaurantId: string; originalName?: string; uploadedById?: string; kind: "RECEIPT" | "DOCUMENT" }) {
  if (input.byteLength > MAX_DOC_BYTES) throw new MediaError("File is larger than 10 MB");
  const isPdf = input.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf) return processImage(input, { ...opts, isPrivate: true, maxSize: 2400 });
  const id = randomToken(12);
  const storageKey = `${opts.kind.toLowerCase()}/${opts.restaurantId}/${id}.pdf`;
  await putLocal(storageKey, input, true);
  const asset = await prisma.mediaAsset.create({
    data: {
      restaurantId: opts.restaurantId,
      kind: opts.kind,
      isPrivate: true,
      storageKey,
      url: "",
      mimeType: "application/pdf",
      sizeBytes: input.byteLength,
      originalName: opts.originalName?.slice(0, 200),
      checksum: sha256(input),
      uploadedById: opts.uploadedById,
    },
  });
  return prisma.mediaAsset.update({ where: { id: asset.id }, data: { url: `/api/private-media/${asset.id}` } });
}

export function sniffVideo(head: Buffer): "mp4" | "webm" | null {
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return "mp4"; // mp4 / mov / m4v
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "webm";
  return null;
}

/** Stores a raw uploaded video (already on disk) and creates its asset in PROCESSING form. */
export async function storeRawVideo(tmpFile: string, opts: { restaurantId: string; originalName?: string; uploadedById?: string }) {
  const stat = await fs.stat(tmpFile);
  if (stat.size > MAX_VIDEO_BYTES) throw new MediaError("Video is larger than 200 MB");
  const fh = await fs.open(tmpFile, "r");
  const head = Buffer.alloc(16);
  await fh.read(head, 0, 16, 0);
  await fh.close();
  const fmt = sniffVideo(head);
  if (!fmt) throw new MediaError("Unsupported video format. Upload MP4, MOV or WebM");
  const id = randomToken(12);
  const storageKey = `video/${opts.restaurantId}/raw/${id}.${fmt}`;
  // raw originals are kept private; processed renditions are public
  await moveLocal(tmpFile, storageKey, true);
  return prisma.mediaAsset.create({
    data: {
      restaurantId: opts.restaurantId,
      kind: "VIDEO",
      isPrivate: true,
      storageKey,
      url: "",
      mimeType: fmt === "mp4" ? "video/mp4" : "video/webm",
      sizeBytes: stat.size,
      originalName: opts.originalName?.slice(0, 200),
      uploadedById: opts.uploadedById,
    },
  });
}

function run(cmd: string, args: string[], timeoutMs = 10 * 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, stdout, stderr: String(e) });
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Transcodes to a mobile-friendly H.264/AAC MP4 (max 720p, faststart for
 * progressive playback) and extracts a poster frame.
 */
export async function processVideoAsset(assetId: string): Promise<{ videoUrl: string; posterUrl: string | null; durationSec: number | null }> {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  const src = localPath(asset.storageKey, true);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "nnv-"));
  try {
    const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", src], 60_000);
    if (probe.code !== 0) throw new MediaError("Could not read the video file");
    const info = JSON.parse(probe.stdout || "{}") as { format?: { duration?: string }; streams?: { codec_type: string }[] };
    if (!info.streams?.some((s) => s.codec_type === "video")) throw new MediaError("The file contains no video stream");
    const duration = info.format?.duration ? Number(info.format.duration) : null;
    if (duration && duration > 180) throw new MediaError("Reels must be 3 minutes or shorter");
    const hasAudio = info.streams.some((s) => s.codec_type === "audio");

    const out = path.join(work, "out.mp4");
    const args = [
      "-y", "-i", src,
      "-vf", "scale='min(720,iw)':-2:flags=lanczos,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "main", "-maxrate", "2500k", "-bufsize", "5000k",
      "-movflags", "+faststart",
      ...(hasAudio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : ["-an"]),
      out,
    ];
    const tr = await run("ffmpeg", args);
    if (tr.code !== 0) throw new MediaError(`Video processing failed: ${tr.stderr.split("\n").slice(-3).join(" ")}`);

    const posterRaw = path.join(work, "poster.jpg");
    const seek = duration && duration > 2 ? "1" : "0";
    await run("ffmpeg", ["-y", "-ss", seek, "-i", out, "-frames:v", "1", "-q:v", "3", posterRaw], 60_000);

    const id = randomToken(12);
    const base = `video/${asset.restaurantId}/${id}`;
    let posterBuf: Buffer | null = null;
    try {
      posterBuf = await sharp(await fs.readFile(posterRaw)).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    } catch {}

    let videoUrl: string, posterUrl: string | null = null;
    if (driver() === "cloudinary") {
      const up = await uploadCloudinary(await fs.readFile(out), "video", `numnum/${base}`);
      videoUrl = up.url;
      posterUrl = up.posterUrl ?? null;
    } else {
      videoUrl = await moveLocal(out, `${base}.mp4`, false);
      if (posterBuf) posterUrl = await putLocal(`${base}_poster.webp`, posterBuf, false);
    }
    const stat = await fs.stat(localPath(asset.storageKey, true));
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { url: videoUrl, posterUrl, durationSec: duration, sizeBytes: stat.size, mimeType: "video/mp4" },
    });
    return { videoUrl, posterUrl, durationSec: duration };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** Writes an incoming request body stream to a temp file, enforcing a byte limit. */
export async function streamToTempFile(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<{ file: string; size: number }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nnu-"));
  const file = path.join(dir, "upload.bin");
  const fh = await fs.open(file, "w");
  let size = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new MediaError(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
      }
      await fh.write(value);
    }
  } catch (e) {
    await fh.close();
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
  await fh.close();
  return { file, size };
}
