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

/** The pooled element for a reel; reels within four of each other never share one. */
export function pooledVideo(index: number): HTMLVideoElement {
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
export async function unlockPooledVideos(active: HTMLVideoElement | null): Promise<boolean> {
  // Others are unlocked fire-and-forget: an element with no source yet never settles play().
  for (const v of pool ?? []) {
    if (v === active) continue;
    v.muted = false;
    const p = v.play();
    v.pause();
    void p?.catch(() => {});
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
