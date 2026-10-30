"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/**
 * iOS home-screen apps with a translucent status bar sometimes report a viewport shorter than
 * the screen by the status bar height, leaving fixed bottom bars floating above a blank strip.
 * Measure that gap and expose it as --vp-gap (0 everywhere else).
 */
export function ViewportFix() {
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    const update = () => {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const gap = screenH - window.innerHeight;
      // Only the status-bar-sized discrepancy; anything larger is a keyboard or split view.
      document.documentElement.style.setProperty("--vp-gap", gap > 0 && gap <= 80 ? `${gap}px` : "0px");
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return null;
}
