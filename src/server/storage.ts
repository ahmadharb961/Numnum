import "server-only";
import { createHash } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";

// Pluggable storage. "local" stores files under STORAGE_DIR and serves public
// files at /media/<key> (with HTTP Range support for video). Private files
// (payment receipts, verification documents) are never publicly addressable
// and are streamed through an authorized route.
// "cloudinary" stores public images and videos on Cloudinary's CDN; private
// files always stay on the local private store.

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

export function driver(): "local" | "cloudinary" {
  return process.env.STORAGE_DRIVER === "cloudinary" && process.env.CLOUDINARY_CLOUD_NAME ? "cloudinary" : "local";
}

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

export async function deleteLocal(key: string, isPrivate: boolean) {
  await fs.unlink(localPath(key, isPrivate)).catch(() => {});
}

export async function statLocal(key: string, isPrivate: boolean) {
  return fs.stat(localPath(key, isPrivate));
}

export function streamLocal(key: string, isPrivate: boolean, range?: { start: number; end: number }) {
  return createReadStream(localPath(key, isPrivate), range);
}

// ───── Cloudinary (signed REST upload, no SDK) ─────

function cloudinarySign(params: Record<string, string>) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + process.env.CLOUDINARY_API_SECRET).digest("hex");
}

export async function uploadCloudinary(file: Buffer, resourceType: "image" | "video", publicId: string) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
  const params: Record<string, string> = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]));
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append("api_key", process.env.CLOUDINARY_API_KEY!);
  form.append("signature", cloudinarySign(params));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { public_id: string; width: number; height: number; duration?: number; bytes: number };
  const base = `https://res.cloudinary.com/${cloud}/${resourceType}/upload`;
  if (resourceType === "image") {
    return {
      url: `${base}/f_auto,q_auto,c_limit,w_1600/${json.public_id}`,
      thumbUrl: `${base}/f_auto,q_auto,c_limit,w_480/${json.public_id}`,
      width: json.width,
      height: json.height,
    };
  }
  return {
    url: `${base}/q_auto,vc_auto,c_limit,w_720/${json.public_id}.mp4`,
    posterUrl: `${base}/so_1,q_auto,c_limit,w_720/${json.public_id}.jpg`,
    width: json.width,
    height: json.height,
    duration: json.duration,
  };
}
