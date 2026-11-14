"use client";

// Until the first reel is playing, nothing else should compete with it for the connection (tab
// prefetches, dish details, review prompt). The feed calls markFeedReady() when the first reel
// plays; whenFeedReady() runs work then, or after `fallbackMs` on pages without a feed.

let ready = false;
const waiting = new Set<() => void>();

export function markFeedReady() {
  if (ready) return;
  ready = true;
  for (const fn of waiting) fn();
  waiting.clear();
}

/** Runs `fn` once the first reel plays (or after `fallbackMs`); returns a cancel function. */
export function whenFeedReady(fn: () => void, fallbackMs = 2500): () => void {
  if (ready) {
    fn();
    return () => {};
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    waiting.delete(run);
    clearTimeout(t);
    fn();
  };
  const t = setTimeout(run, fallbackMs);
  waiting.add(run);
  return () => {
    done = true;
    waiting.delete(run);
    clearTimeout(t);
  };
}
