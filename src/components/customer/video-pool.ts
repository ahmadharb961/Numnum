// A few <video> elements reused by every reel. iOS Safari grants "may play with sound" per
// element, after a play() inside a user gesture. Fresh elements per reel would each start muted,
// so the feed recycles these: once unlocked by the first tap, every later reel plays with sound.

const SIZE = 3; // previous, current, next reel
let pool: HTMLVideoElement[] | null = null;

function create(): HTMLVideoElement {
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.loop = true;
  return v;
}

/** The pooled element for a reel; reels i, i+1, i+2 never share one. */
export function pooledVideo(index: number): HTMLVideoElement {
  pool ??= Array.from({ length: SIZE }, create);
  return pool[index % SIZE];
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
