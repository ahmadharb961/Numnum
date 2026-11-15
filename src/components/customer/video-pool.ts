import { playableSrc, reportedDownlink } from "@/lib/video-src";

// A few <video> elements reused by every reel. iOS Safari grants "may play with sound" per
// element, after a play() inside a user gesture. Fresh elements per reel would each start muted,
// so the feed recycles these: once unlocked by the first tap, every later reel plays with sound.

const SIZE = 5; // previous, current and the next two reels (+1 spare so they never collide)
let pool: HTMLVideoElement[] | null = null;

function create(): HTMLVideoElement {
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.loop = true;
  return v;
}

type EarlyVideo = { src: string; v: HTMLVideoElement; i: number; taken: boolean };

// Elements that already hold a reel's first seconds, by the reel's video URL: the reel you left
// when switching tab or opening a restaurant (so coming back plays at once), and the first reel of
// the other tab, loaded in advance. Only for videos the browser plays itself (MP4, HLS on iPhone);
// hls.js browsers get the same effect from the HTTP cache (see warmVideo).
const WARM_MAX = 3;
const warm = new Map<string, HTMLVideoElement>();
const kept = new WeakSet<HTMLVideoElement>();
const nativeHls = () => typeof document !== "undefined" && !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
const isHls = (src: string) => /\.m3u8(\?|$)/.test(src);
/** Played by the <video> element itself (MP4 anywhere, HLS on iPhone), not through hls.js. */
const plainVideo = (src: string) => !isHls(src) || nativeHls();

function keep(key: string, v: HTMLVideoElement) {
  warm.delete(key);
  warm.set(key, v);
  kept.add(v);
  while (warm.size > WARM_MAX) {
    const [oldKey, old] = warm.entries().next().value as [string, HTMLVideoElement];
    warm.delete(oldKey);
    kept.delete(old);
    old.pause();
    old.removeAttribute("src");
    old.load();
    old.remove();
  }
}

/** Set aside by stashVideo/warmVideo: the player must not wipe what it has downloaded. */
export const isKept = (v: HTMLVideoElement) => kept.has(v);

/** Same video, whatever start-quality hint each URL carries. */
export const sameVideo = (a: string, b: string) => a.replace(/[?&]clientBandwidthHint=[^&]*/, "") === b.replace(/[?&]clientBandwidthHint=[^&]*/, "");

/**
 * Keeps the element playing reel `index` aside, with what it has downloaded, instead of letting
 * the player discard it; its slot gets a fresh element. Coming back to that reel adopts it again.
 */
export function stashVideo(index: number, key: string | null | undefined) {
  if (!pool || !key || !plainVideo(key)) return;
  const v = pool[index % SIZE];
  if (!v.getAttribute("src") || !sameVideo(v.src, new URL(playableSrc(key, reportedDownlink()), location.href).href)) return;
  v.pause();
  keep(key, v);
  pool[index % SIZE] = create();
  if (unlocked) prime(pool[index % SIZE]);
}

/**
 * Starts loading a reel before it's shown (the other tab's first reel): its first seconds are
 * ready when the person switches. iPhone: a hidden <video> plays muted until the first frame, then
 * waits at 0:00 (Safari doesn't preload a video that never played). hls.js browsers: the playlist
 * and first segments are fetched into the HTTP cache, where hls.js finds them.
 */
export function warmVideo(key: string | null | undefined) {
  if (!key || warm.has(key) || typeof window === "undefined") return;
  if (!plainVideo(key)) return void prefetchHls(key);
  const v = create();
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.preload = "auto";
  v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  v.src = playableSrc(key, reportedDownlink());
  document.body.appendChild(v);
  keep(key, v);
  const back = () => {
    v.removeEventListener("timeupdate", back);
    if (!kept.has(v)) return; // adopted by the feed meanwhile: it's playing for real
    v.pause();
    try {
      v.currentTime = 0;
    } catch {}
  };
  v.addEventListener("timeupdate", back);
  void v.play().catch(() => v.removeEventListener("timeupdate", back));
}

/** hls.js: the playlist, the ~540p rendition's playlist and its first two segments. */
async function prefetchHls(url: string) {
  try {
    const master = await (await fetch(url, { mode: "cors", credentials: "omit" })).text();
    // The shorter side, as for the player ("540p" of a portrait reel is 540×960).
    const variants = [...master.matchAll(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n([^\n#]+)/g)].map((m) => ({ h: Math.min(Number(m[1]), Number(m[2])), uri: m[3].trim() }));
    if (!variants.length) return;
    const pick = variants.filter((v) => v.h <= 540).sort((a, b) => b.h - a.h)[0] ?? variants.sort((a, b) => a.h - b.h)[0];
    const playlistUrl = new URL(pick.uri, url).href;
    const media = await (await fetch(playlistUrl, { mode: "cors", credentials: "omit" })).text();
    const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(media)?.[1];
    const segments = media.split("\n").filter((l) => l && !l.startsWith("#")).slice(0, 2);
    await Promise.all([...(init ? [init] : []), ...segments].map((u) => fetch(new URL(u, playlistUrl).href, { mode: "cors", credentials: "omit" }).then((r) => r.arrayBuffer()).catch(() => null)));
  } catch {
    // only a head start: the player loads it normally
  }
}

/** The pooled element for a reel; reels within four of each other never share one. A reel whose
 *  video was set aside or loaded in advance (`key` = its video URL) gets that element back. */
export function pooledVideo(index: number, key?: string | null): HTMLVideoElement {
  if (!pool) {
    pool = Array.from({ length: SIZE }, create);
    // The page already started the first reel in a <video> before the app loaded
    // (firstReelBootScript): adopt that element, with whatever it has downloaded.
    const early = (window as Window & { __nnFirst?: EarlyVideo }).__nnFirst;
    if (early?.v.isConnected) {
      early.v.style.cssText = "";
      pool[early.i % SIZE] = early.v;
    }
  }
  const ready = key ? warm.get(key) : undefined;
  if (ready) {
    warm.delete(key!);
    kept.delete(ready);
    ready.style.cssText = "";
    pool[index % SIZE] = ready;
  }
  return pool[index % SIZE];
}

/** The page's early <video> is now driven by the feed (it stops pausing itself at 0:00). */
export function claimEarlyVideo(v: HTMLVideoElement) {
  const early = (window as Window & { __nnFirst?: EarlyVideo }).__nnFirst;
  if (early && early.v === v) early.taken = true;
}

/**
 * Call inside a user gesture (tap/click/key). Plays each pooled element with sound so the
 * browser marks it as allowed; all but `active` are paused again right away.
 * Resolves true when the active element is playing with sound.
 */
let unlocked = false;
function prime(v: HTMLVideoElement) {
  const wasMuted = v.muted;
  v.muted = false;
  const p = v.play();
  v.pause();
  void p?.catch(() => {});
  if (kept.has(v)) v.muted = wasMuted; // set-aside elements stay silent until the feed adopts them
}

/** Inside a tap (e.g. on a tab): lets the elements set aside or loaded in advance play with sound too. */
export function primeKeptVideos() {
  if (unlocked) warm.forEach(prime);
}

export async function unlockPooledVideos(active: HTMLVideoElement | null): Promise<boolean> {
  unlocked = true;
  // Others are unlocked fire-and-forget: an element with no source yet never settles play().
  for (const v of [...(pool ?? []), ...warm.values()]) {
    if (v === active) continue;
    prime(v);
  }
  if (!active) return false;
  active.muted = false;
  try {
    await active.play();
    return true;
  } catch {
    return false;
  }
}
