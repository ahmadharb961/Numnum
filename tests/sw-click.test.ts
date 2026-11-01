import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Runs public/sw.js with a fake service-worker scope and taps a notification.
type Win = { url: string; focus: () => Promise<Win>; postMessage: (m: unknown) => void; posted: unknown[] };
function loadWorker(windows: Win[], { focusFails = false } = {}) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const opened: string[] = [];
  const self = {
    location: { origin: "https://numnum.me" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => opened.push(url),
      claim: async () => {},
    },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
  };
  if (focusFails) for (const w of windows) w.focus = () => Promise.reject(new Error("not allowed"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches: {}, fetch: () => {}, URL, Response, console });
  const tap = async (url: string) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { tap, opened };
}
const win = (url: string): Win => {
  const w: Win = { url, posted: [], focus: async () => w, postMessage: (m) => w.posted.push(m) };
  return w;
};

describe("tapping a notification", () => {
  it("opens the message when the app is closed", async () => {
    const sw = loadWorker([]);
    await sw.tap("/m/abc");
    expect(sw.opened).toEqual(["https://numnum.me/m/abc"]);
  });

  it("brings the open app forward and sends it to the message", async () => {
    const w = win("https://numnum.me/dashboard/orders");
    const sw = loadWorker([w]);
    await sw.tap("/m/abc");
    expect(w.posted).toEqual([{ type: "nn:open", url: "https://numnum.me/m/abc" }]);
    expect(sw.opened).toEqual([]);
  });

  it("opens a new window if the open app can't be focused", async () => {
    const w = win("https://numnum.me/");
    const sw = loadWorker([w], { focusFails: true });
    await sw.tap("/m/abc");
    expect(sw.opened).toEqual(["https://numnum.me/m/abc"]);
  });

  it("opens links to other sites in the browser", async () => {
    const w = win("https://numnum.me/");
    const sw = loadWorker([w]);
    await sw.tap("https://instagram.com/numnum");
    expect(sw.opened).toEqual(["https://instagram.com/numnum"]);
    expect(w.posted).toEqual([]);
  });

  it("order notifications open the order page", async () => {
    const sw = loadWorker([]);
    await sw.tap("/dashboard/orders?ref=NN-2026-000001");
    expect(sw.opened).toEqual(["https://numnum.me/dashboard/orders?ref=NN-2026-000001"]);
  });
});
