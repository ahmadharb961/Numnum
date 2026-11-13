import "server-only";
import { prisma } from "./db";
import { getBlob } from "./storage";

/**
 * Public photos (dishes, logos, covers, reel covers, review and broadcast photos) on Cloudflare
 * Images, delivered from Cloudflare's network near the customer instead of from our server.
 * Uses the same Cloudflare account as Stream. The API token needs "Cloudflare Images: Edit"
 * (CLOUDFLARE_IMAGES_API_TOKEN, or the Stream token once that permission is added to it).
 * Every photo is also kept in the database, so nothing is lost if Cloudflare isn't set up or fails:
 * the photo is then served by our own /media route, as before.
 */

const VARIANT = "orig"; // photos are already resized here, so the variant only re-encodes (WebP/AVIF)
const accountId = () => process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = () => (process.env.CLOUDFLARE_IMAGES_API_TOKEN || process.env.CLOUDFLARE_STREAM_API_TOKEN)?.trim();
// CLOUDFLARE_API_BASE only exists for end-to-end tests against a stand-in server.
const api = () => `${process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4"}/accounts/${accountId()}/images`;
const auth = () => ({ Authorization: `Bearer ${token()}` });

export function imagesConfigured() {
  return !!(accountId() && token());
}

/** Why the last call failed, in plain words (shown in Admin → Settings). */
export let lastImagesError: string | null = null;
let pausedUntil = 0; // after a permission error, don't retry on every upload
let variantReady = false;
let deliveryHash: string | null = null;

type CfResponse<T> = { success: boolean; errors?: { code: number; message: string }[]; result?: T };

async function call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: CfResponse<T> }> {
  const r = await fetch(`${api()}${path}`, { ...init, headers: { ...auth(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  const body = (await r.json().catch(() => ({ success: false, errors: [{ code: r.status, message: r.statusText }] }))) as CfResponse<T>;
  return { status: r.status, body };
}

function explain(status: number, body: CfResponse<unknown>) {
  if (status === 401 || status === 403) return "The Cloudflare API token doesn't have the \"Cloudflare Images: Edit\" permission";
  return `Cloudflare answered ${status}: ${body.errors?.map((e) => e.message).join(", ") || "unknown error"}`;
}

let variantSetup: Promise<void> | null = null;

/** The "orig" variant: no resizing (fit scale-down, 4000 px), so photos keep the size we made them. */
function ensureVariant(): Promise<void> {
  if (variantReady) return Promise.resolve();
  variantSetup ??= (async () => {
    const exists = async () => {
      const got = await call<unknown>(`/v1/variants/${VARIANT}`);
      if (got.body.success) return true;
      if (got.status === 401 || got.status === 403) throw new Error(explain(got.status, got.body));
      return false;
    };
    if (!(await exists())) {
      const made = await call<unknown>("/v1/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: VARIANT, options: { fit: "scale-down", width: 4000, height: 4000, metadata: "none" }, neverRequireSignedURLs: true }) });
      // Another server process may have created it at the same moment: check again before failing.
      if (!made.body.success && !(await exists())) throw new Error(explain(made.status, made.body));
    }
    variantReady = true;
  })().finally(() => {
    variantSetup = null;
  });
  return variantSetup;
}

/** imagedelivery.net/<hash>/<id>/<variant>, the hash read from Cloudflare's own answer. */
function deliveryUrl(id: string, variants?: string[]) {
  const found = variants?.map((v) => /^https:\/\/imagedelivery\.net\/([^/]+)\//.exec(v)?.[1]).find(Boolean);
  if (found) deliveryHash = found;
  return deliveryHash ? `https://imagedelivery.net/${deliveryHash}/${id}/${VARIANT}` : null;
}

/** Uploads one image under a fixed id; an image already uploaded with that id counts as done. */
async function uploadOne(id: string, data: Buffer): Promise<string | null> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: "image/webp" }), `${id}.webp`);
  form.append("id", id);
  const up = await call<{ variants?: string[] }>("/v1", { method: "POST", body: form });
  if (up.body.success) return deliveryUrl(id, up.body.result?.variants);
  const alreadyThere = up.status === 409 || up.body.errors?.some((e) => e.code === 5409 || /already exists/i.test(e.message));
  if (alreadyThere) {
    const got = await call<{ variants?: string[] }>(`/v1/${encodeURIComponent(id)}`);
    if (got.body.success) return deliveryUrl(id, got.body.result?.variants);
  }
  throw new Error(explain(up.status, up.body));
}

/**
 * Puts an image (main + thumbnail) on Cloudflare. Returns the two delivery URLs, or null when
 * Cloudflare isn't set up or refused it (the photo then stays served from our server).
 */
export async function pushToCloudflare(assetId: string, main: Buffer, thumb: Buffer, opts: { deadlineMs?: number } = {}): Promise<{ url: string; thumbUrl: string } | null> {
  if (!imagesConfigured() || Date.now() < pausedUntil) return null;
  const work = upload(assetId, main, thumb);
  if (!opts.deadlineMs) return work;
  // A slow Cloudflare must not hold up a restaurant's upload: past the deadline the photo is served
  // from our server (an upload still finishing is picked up by "Move photos" later).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), opts.deadlineMs)));
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function upload(assetId: string, main: Buffer, thumb: Buffer): Promise<{ url: string; thumbUrl: string } | null> {
  try {
    await ensureVariant();
    const url = await uploadOne(assetId, main);
    const thumbUrl = await uploadOne(`${assetId}_t`, thumb);
    if (!url || !thumbUrl) throw new Error("Cloudflare didn't return a delivery address");
    lastImagesError = null;
    return { url, thumbUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastImagesError = /fetch failed|ENOTFOUND|ECONNRE|ETIMEDOUT|aborted|timeout/i.test(msg) ? `Couldn't reach Cloudflare from the server (${msg}). Try again in a few minutes.` : msg;
    if (/permission|401|403/.test(lastImagesError)) pausedUntil = Date.now() + 10 * 60_000;
    console.error("Cloudflare Images upload failed:", lastImagesError);
    return null;
  }
}

/** Tests only: forget what this process learned about the Cloudflare account. */
export function resetCloudflareImagesState() {
  lastImagesError = null;
  pausedUntil = 0;
  variantReady = false;
  variantSetup = null;
  deliveryHash = null;
}

/** Removes an image (and its thumbnail) from Cloudflare. Best effort. */
export async function deleteFromCloudflare(assetId: string) {
  if (!imagesConfigured()) return;
  await Promise.allSettled([assetId, `${assetId}_t`].map((id) => call(`/v1/${encodeURIComponent(id)}`, { method: "DELETE" })));
}

// Every column that stores a public photo's address (checked against the whole database schema),
// kept in step when a photo moves. Old /media addresses keep working too (the database copy stays).
const replaceEverywhere = (oldUrl: string, newUrl: string) => [
  prisma.restaurant.updateMany({ where: { logoUrl: oldUrl }, data: { logoUrl: newUrl } }),
  prisma.restaurant.updateMany({ where: { coverUrl: oldUrl }, data: { coverUrl: newUrl } }),
  prisma.reel.updateMany({ where: { posterUrl: oldUrl }, data: { posterUrl: newUrl } }),
  prisma.foodCategory.updateMany({ where: { imageUrl: oldUrl }, data: { imageUrl: newUrl } }),
  prisma.itemReview.updateMany({ where: { photoUrl: oldUrl }, data: { photoUrl: newUrl } }),
  prisma.pushBroadcast.updateMany({ where: { imageUrl: oldUrl }, data: { imageUrl: newUrl } }),
  prisma.notification.updateMany({ where: { imageUrl: oldUrl }, data: { imageUrl: newUrl } }),
];

// Public photos served by our server that still have their stored copy (so they can be moved).
const onServer = { kind: "IMAGE" as const, isPrivate: false, url: { startsWith: "/media/i/" }, blobs: { some: { variant: "main" } } };

export async function photoCounts() {
  const [server, cloudflare] = await Promise.all([prisma.mediaAsset.count({ where: onServer }), prisma.mediaAsset.count({ where: { kind: "IMAGE", isPrivate: false, url: { startsWith: "https://imagedelivery.net/" } } })]);
  return { server, cloudflare };
}

/** Moves up to `limit` photos still served by our server to Cloudflare. Safe to run again. */
export async function movePhotosToCloudflare(limit = 15): Promise<{ moved: number; remaining: number; error: string | null }> {
  if (!imagesConfigured()) return { moved: 0, remaining: (await photoCounts()).server, error: "Cloudflare isn't set up on the server (CLOUDFLARE_ACCOUNT_ID and an API token)" };
  pausedUntil = 0; // an admin asked: try now
  const batch = await prisma.mediaAsset.findMany({ where: onServer, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, url: true, thumbUrl: true } });
  let moved = 0;
  for (const a of batch) {
    const [main, thumb] = await Promise.all([getBlob(a.id, "main"), getBlob(a.id, "thumb")]);
    if (!main) continue; // can't happen (filtered above); kept as a guard
    const cf = await pushToCloudflare(a.id, main, thumb ?? main);
    if (!cf) return { moved, remaining: (await photoCounts()).server, error: lastImagesError };
    // All or nothing: the photo's new address and every place that shows it change together.
    await prisma.$transaction([
      prisma.mediaAsset.update({ where: { id: a.id }, data: { url: cf.url, thumbUrl: cf.thumbUrl, storageKey: "cf" } }),
      ...replaceEverywhere(a.url, cf.url),
      ...(a.thumbUrl ? replaceEverywhere(a.thumbUrl, cf.thumbUrl) : []),
    ]);
    moved++;
  }
  return { moved, remaining: (await photoCounts()).server, error: null };
}
