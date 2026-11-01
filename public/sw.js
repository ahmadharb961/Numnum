// numnum service worker: installability + light offline support.
// - static assets: cache-first
// - images/posters: stale-while-revalidate (bounded)
// - pages: handled by the browser; offline page when the device is offline
// - API, uploads and videos: never cached (videos use HTTP range requests)
const VERSION = "nn-v9";
const STATIC = `${VERSION}-static`;
const IMAGES = `${VERSION}-images`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/v2/icon-192.png", "/icons/v2/favicon-32.png"])).then(() => self.skipWaiting()));
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
    // Online, pages are left to the browser: they stream (React Suspense), and serving them
    // through the worker, even untouched, changed the chunk timing enough to break hydration
    // now and then. Offline, show the offline page.
    if (self.navigator.onLine === false) e.respondWith(caches.match(OFFLINE_URL).then((r) => r || Response.error()));
  }
});

// ───── Push notifications (new orders, order updates, admin broadcasts) ─────
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "numnum", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "numnum", {
      body: d.body || "",
      icon: "/icons/v2/icon-192.png",
      badge: "/icons/v2/icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      image: d.image || undefined,
      // Stays on screen until tapped: new orders, order updates and admin broadcasts.
      requireInteraction: d.requireInteraction ?? (d.tag || "").startsWith("order-"),
      vibrate: [200, 100, 200, 100, 200],
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Links to other sites open in the browser instead of replacing the app.
      if (new URL(url).origin !== self.location.origin) return self.clients.openWindow(url);
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = list.find((c) => c.url.startsWith(self.location.origin));
      if (!win) return self.clients.openWindow(url);
      const focused = await win.focus().catch(() => win);
      if ("navigate" in focused) return focused.navigate(url).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    })(),
  );
});
