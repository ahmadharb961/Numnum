"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Inside the numnum store app: when a numnum.me link (a reel shared on WhatsApp, a restaurant, an
 * order) opens the app, go straight to that page. Web browsers ignore this.
 */
export function AppDeepLinks() {
  const router = useRouter();
  useEffect(() => {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("appUrlOpen", ({ url }) => {
        try {
          const u = new URL(url);
          if (/(^|\.)numnum\.me$/.test(u.hostname)) router.push(u.pathname + u.search + u.hash);
        } catch {}
      }).then((h) => (remove = () => void h.remove())),
    );
    return () => remove?.();
  }, [router]);
  return null;
}
