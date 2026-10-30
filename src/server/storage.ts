import "server-only";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

// Storage:
//  - Images and private documents (receipts, verification files) are stored as
//    bytes in Postgres (media_blobs). Works on any host, nothing to mount.
//    Public images are served from /media/i/<assetId>.webp with immutable
//    cache headers, so Cloudflare / the browser cache them after the first hit.
//  - Videos go to Cloudflare Stream when configured (see stream.ts). Without
//    Stream (local development or a VPS with ffmpeg), raw uploads and the
//    transcoded MP4s live on disk under STORAGE_DIR.

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

export async function putBlob(assetId: string, variant: "main" | "thumb", data: Buffer) {
  await prisma.mediaBlob.upsert({
    where: { assetId_variant: { assetId, variant } },
    create: { assetId, variant, data: new Uint8Array(data) },
    update: { data: new Uint8Array(data) },
  });
}

export async function getBlob(assetId: string, variant: "main" | "thumb") {
  const b = await prisma.mediaBlob.findUnique({ where: { assetId_variant: { assetId, variant } }, select: { data: true } });
  return b ? Buffer.from(b.data) : null;
}

export function publicImageUrl(assetId: string, variant: "main" | "thumb") {
  return `/media/i/${assetId}${variant === "thumb" ? "_t" : ""}.webp`;
}

// ───── local disk (videos without Stream) ─────

function safeKey(key: string) {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("\0")) throw new Error("Invalid storage key");
  return normalized;
}

export function localPath(key: string, isPrivate: boolean) {
  return path.join(STORAGE_DIR, isPrivate ? "private" : "public", safeKey(key));
}

export async function putLocal(key: string, data: Buffer, isPrivate: boolean): Promise<string> {
  const p = localPath(key, isPrivate);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
  return isPrivate ? "" : `/media/${safeKey(key)}`;
}

export async function moveLocal(srcFile: string, key: string, isPrivate: boolean): Promise<string> {
  const p = localPath(key, isPrivate);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.rename(srcFile, p).catch(async () => {
    await fs.copyFile(srcFile, p);
    await fs.unlink(srcFile);
  });
  return isPrivate ? "" : `/media/${safeKey(key)}`;
}

export async function statLocal(key: string, isPrivate: boolean) {
  return fs.stat(localPath(key, isPrivate));
}

export function streamLocal(key: string, isPrivate: boolean, range?: { start: number; end: number }) {
  return createReadStream(localPath(key, isPrivate), range);
}
