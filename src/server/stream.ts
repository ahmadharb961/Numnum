import "server-only";
import { prisma } from "./db";

/**
 * Cloudflare Stream: phone → Cloudflare resumable uploads (tus), adaptive HLS
 * playback, automatic thumbnails. Reels are public food videos, so playback
 * URLs are unsigned. Uses the same env names as Hireel, so one Cloudflare
 * account and API token can serve both apps.
 */

export const STREAM_MAX_DURATION_SEC = 180;
export const STREAM_MAX_BYTES = 500 * 1024 * 1024;

export function streamConfigured() {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_API_TOKEN);
}

const api = () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream`;
const auth = () => ({ Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}` });
const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64");

export function parseTusMetadata(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (header ?? "").split(",")) {
    const [k, v] = pair.trim().split(" ");
    if (k) out[k] = v ? Buffer.from(v, "base64").toString("utf8") : "";
  }
  return out;
}

/** Asks Cloudflare for a one-time tus upload URL. Our API token never reaches the browser. */
export async function createTusUpload(opts: { uploadLength: string; fileName: string; creator: string }) {
  if (!streamConfigured()) throw new Error("STREAM_NOT_CONFIGURED");
  const metadata = [`name ${b64(opts.fileName.slice(0, 100) || "reel.mp4")}`, `maxDurationSeconds ${b64(String(STREAM_MAX_DURATION_SEC))}`].join(",");
  const res = await fetch(`${api()}?direct_user=true`, {
    method: "POST",
    headers: { ...auth(), "Tus-Resumable": "1.0.0", "Upload-Length": opts.uploadLength, "Upload-Metadata": metadata, "Upload-Creator": opts.creator },
  });
  const location = res.headers.get("location");
  const uid = res.headers.get("stream-media-id");
  if (!res.ok || !location || !uid) throw new Error(`STREAM_UPLOAD_FAILED ${res.status}`);
  return { location, uid };
}

/** Uploads a video file from the server (used by the demo seed); returns the Stream uid. */
export async function uploadVideoToStream(file: Buffer, fileName: string): Promise<string> {
  if (!streamConfigured()) throw new Error("STREAM_NOT_CONFIGURED");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)], { type: "video/mp4" }), fileName);
  const res = await fetch(api(), { method: "POST", headers: auth(), body: form });
  const json = (await res.json().catch(() => null)) as { result?: { uid?: string } } | null;
  const uid = json?.result?.uid;
  if (!res.ok || !uid) throw new Error(`STREAM_UPLOAD_FAILED ${res.status}`);
  return uid;
}

type CloudflareVideo = { readyToStream?: boolean; status?: { state?: string; errorReasonText?: string }; duration?: number; playback?: { hls?: string } };
export type StreamVideoInfo = { ready: boolean; failed: boolean; error: string | null; durationSec: number | null; hls: string | null };

export function parseVideo(v: CloudflareVideo): StreamVideoInfo {
  const state = v.status?.state;
  return {
    ready: Boolean(v.readyToStream) && state === "ready",
    failed: state === "error",
    error: state === "error" ? v.status?.errorReasonText || "Cloudflare could not process this video" : null,
    durationSec: typeof v.duration === "number" && v.duration > 0 ? v.duration : null,
    hls: v.playback?.hls ?? null,
  };
}

export async function getStreamVideo(uid: string): Promise<StreamVideoInfo | null> {
  if (!streamConfigured()) return null;
  const res = await fetch(`${api()}/${uid}`, { headers: auth(), cache: "no-store" });
  if (res.status === 404) return { ready: false, failed: true, error: "Video not found on Cloudflare (upload may not have finished)", durationSec: null, hls: null };
  if (!res.ok) return null;
  return parseVideo(((await res.json()) as { result: CloudflareVideo }).result);
}

export async function deleteStreamVideo(uid: string) {
  if (!streamConfigured()) return;
  const res = await fetch(`${api()}/${uid}`, { method: "DELETE", headers: auth() });
  if (!res.ok && res.status !== 404) throw new Error(`STREAM_DELETE_FAILED ${res.status}`);
}

export function customerCodeFromUrl(url: string | null | undefined): string | null {
  return url?.match(/customer-([a-z0-9]+)\.cloudflarestream\.com/i)?.[1] ?? null;
}

const CODE_KEY = "stream.customerCode";

/** Account playback host code: env override, else learned from Cloudflare once and stored. */
async function customerCode(hlsHint?: string | null): Promise<string | null> {
  if (process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE) return process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  const saved = await prisma.platformSetting.findUnique({ where: { key: CODE_KEY } });
  if (typeof saved?.value === "string") return saved.value;
  const code = customerCodeFromUrl(hlsHint);
  if (code) await prisma.platformSetting.upsert({ where: { key: CODE_KEY }, create: { key: CODE_KEY, value: code }, update: { value: code } });
  return code;
}

export function playbackUrls(code: string, uid: string) {
  const base = `https://customer-${code}.cloudflarestream.com/${uid}`;
  return { hls: `${base}/manifest/video.m3u8`, poster: `${base}/thumbnails/thumbnail.jpg?time=1s&height=1280` };
}

export const isStreamKey = (storageKey: string) => storageKey.startsWith("stream:");
export const streamUidOf = (storageKey: string) => (isStreamKey(storageKey) ? storageKey.slice(7) : null);

/**
 * Brings PROCESSING reels up to date with Cloudflare. Called when restaurants
 * view their reels, and by the hourly cron, so no webhook setup is needed.
 */
export async function syncStreamReels(where: { restaurantId?: string; reelId?: string } = {}) {
  if (!streamConfigured()) return 0;
  const reels = await prisma.reel.findMany({
    where: { status: "PROCESSING", videoAsset: { storageKey: { startsWith: "stream:" } }, ...(where.restaurantId ? { restaurantId: where.restaurantId } : {}), ...(where.reelId ? { id: where.reelId } : {}) },
    include: { videoAsset: true, restaurant: { select: { status: true, restrictReels: true } } },
    take: 50,
  });
  let changed = 0;
  for (const r of reels) {
    const uid = streamUidOf(r.videoAsset.storageKey);
    if (!uid || uid === "pending") continue;
    const info = await getStreamVideo(uid).catch(() => null);
    if (!info) continue;
    if (info.failed) {
      await prisma.reel.update({ where: { id: r.id }, data: { status: "FAILED", processingError: info.error } });
      changed++;
    } else if (info.ready) {
      const code = await customerCode(info.hls);
      if (!code) continue;
      const urls = playbackUrls(code, uid);
      const publish = r.autoPublish && r.visibility === "DRAFT" && r.restaurant.status === "ACTIVE" && !r.restaurant.restrictReels;
      await prisma.reel.update({
        where: { id: r.id },
        data: { status: "READY", videoUrl: urls.hls, posterUrl: r.posterUrl ?? urls.poster, durationSec: info.durationSec, processingError: null, ...(publish ? { visibility: "PUBLISHED", publishedAt: new Date() } : {}) },
      });
      await prisma.mediaAsset.update({ where: { id: r.videoAssetId }, data: { url: urls.hls, posterUrl: urls.poster, durationSec: info.durationSec, mimeType: "application/x-mpegURL" } });
      changed++;
    }
  }
  return changed;
}
