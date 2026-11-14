"use client";

// Until the first reel is playing, nothing else should compete with it for the connection (tab
// prefetches, dish details, review prompt). The feed calls markFeedReady() when the first reel
// plays; whenFeedReady() runs work then (or after `fallbackMs` at the latest). Pages without a reel
// feed run it right away.

let ready = false;
let feeds = 0; // reel feeds on the page right now
/** Set by the feed page's inline script before the app starts (the feed itself renders later). */
const feedPageFlag = () => typeof window !== "undefined" && !!(window as Window & { __nnFeedPage?: boolean }).__nnFeedPage;
const waiting = new Set<() => void>();

/** A reel feed is on the page (call from a layout effect, so it runs before others' effects). */
export function registerFeed(): () => void {
  feeds++;
  return () => {
    feeds--;
    if (typeof window !== "undefined") (window as Window & { __nnFeedPage?: boolean }).__nnFeedPage = false;
    // Leaving the feed before it played: nothing should keep waiting for it.
    if (feeds === 0) markFeedReady();
  };
}

export function markFeedReady() {
  if (ready) return;
  ready = true;
  for (const fn of waiting) fn();
  waiting.clear();
}

/** Runs `fn` once the first reel plays (or after `fallbackMs`); returns a cancel function. */
export function whenFeedReady(fn: () => void, fallbackMs = 2500): () => void {
  // Pages without reels (order tracking, cart, account…) don't wait at all.
  if (ready || (feeds === 0 && !feedPageFlag())) {
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
