// numnum service worker: installability + light offline support.
// - static assets: cache-first
// - images/posters: stale-while-revalidate (bounded)
// - pages: network-first with offline fallback
// - API, uploads and videos: never cached (videos use HTTP range requests)
const VERSION = "nn-v1";
const STATIC = `${VERSION}-static`;
const IMAGES = `${VERSION}-images`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/admin") || /\.(mp4|webm)$/.test(url.pathname) || req.headers.has("range")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.destination === "image") {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok) { c.put(req, res.clone()); trim(IMAGES, 300); } return res; }).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(PAGES).then((c) => { c.put(req, copy); trim(PAGES, 30); }); return res; })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL))),
    );
  }
});
