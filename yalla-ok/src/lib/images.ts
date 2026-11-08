import "server-only";
import sharp, { type Metadata as SharpMetadata } from "sharp";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif", "gif"]);

export class ImageError extends Error {}

/** Returns the File from a form field, or null when the field is empty. */
export function fileFromForm(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  if (!value || typeof value === "string" || value.size === 0) return null;
  return value;
}

/**
 * Validates an upload by decoding it (not by trusting the extension or MIME
 * type), fixes rotation, strips metadata (EXIF/GPS) and re-encodes as WebP.
 */
async function toWebp(file: File, maxDim: number, quality = 80): Promise<Buffer> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError("Images must be under 8 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  let meta: SharpMetadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageError("That file isn’t an image we can read. Use JPG, PNG or WebP.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new ImageError("Use a JPG, PNG or WebP image.");
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > 60_000_000) throw new ImageError("That image is too large.");
  return sharp(input, { animated: false })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function put(bucket: string, path: string, body: Buffer) {
  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(path, body, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw new ImageError("Upload failed. Please try again.");
}

/** Task photo in two sizes. Returns the storage path of the large one. */
export async function uploadTaskImage(userId: string, file: File): Promise<string> {
  const id = randomUUID();
  const [lg, sm] = await Promise.all([toWebp(file, 1280, 80), toWebp(file, 640, 76)]);
  const path = `${userId}/${id}.webp`;
  await put("task-images", path, lg);
  await put("task-images", `${userId}/${id}-sm.webp`, sm);
  return path;
}

export async function removeTaskImage(path: string) {
  await createAdminClient()
    .storage.from("task-images")
    .remove([path, path.replace(/\.webp$/, "-sm.webp")]);
}

export async function uploadPaymentProof(userId: string, file: File): Promise<string> {
  const path = `${userId}/${randomUUID()}.webp`;
  await put("payment-proofs", path, await toWebp(file, 1600, 82));
  return path;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const path = `${userId}/${randomUUID()}.webp`;
  const body = await sharp(await toWebp(file, 512)).resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  await put("avatars", path, body);
  return path;
}
