"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Tapping a notification while the app is open: the worker asks this page to open its link.
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type !== "nn:open" || !d.url) return;
      const u = new URL(d.url, location.origin);
      if (u.origin === location.origin) location.assign(u.pathname + u.search + u.hash);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
