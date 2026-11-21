"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/push-client";

const ID_KEY = "nn_app_device";
const DAY_KEY = "nn_app_open_day";

/**
 * Inside the numnum store app: tell the server the app is installed and in use, at most once a day,
 * a few seconds after opening (never in the way of the first screen or reel). Admin → Overview counts
 * these. A random id made on the phone, nothing else about it.
 */
export function AppOpenPing() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const t = setTimeout(() => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(DAY_KEY) === today) return;
        let id = localStorage.getItem(ID_KEY);
        if (!id) {
          id = crypto.randomUUID().replace(/-/g, "");
          localStorage.setItem(ID_KEY, id);
        }
        const cap = (window as unknown as { Capacitor?: { getPlatform(): string } }).Capacitor;
        const platform = cap?.getPlatform() === "ios" || /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "android";
        void fetch("/api/app-open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, platform }), keepalive: true })
          .then((r) => r.ok && localStorage.setItem(DAY_KEY, today))
          .catch(() => {});
      } catch {
        // Storage unavailable: skip (it's only a count).
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
