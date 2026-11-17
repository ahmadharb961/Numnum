"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHydrated } from "@/components/customer/cart";
import { screenAge } from "@/lib/page-fetch-times";

// A screen that came from the server this recently is current enough: no second fetch.
const FRESH_MS = 30_000;

/**
 * Screens kept in the browser (next.config staleTimes) open instantly. On pages that must always be
 * current (restaurant dashboard, admin, the customer's account) this also fetches the latest version
 * right after each in-app navigation, so the screen updates a moment later. A page that was just
 * loaded from the server (first visit, reload, or loaded in advance in the last 30 seconds) isn't
 * fetched twice.
 */
export function FreshOnNavigate() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated(); // false while hydrating a server-loaded page, true when opened in-app
  const openedInApp = useRef(hydrated);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!openedInApp.current) return;
    }
    // Opened from a copy loaded seconds ago (links load their screen in advance): already current.
    // Refreshing anyway would also make the browser forget every other screen loaded in advance.
    if (screenAge(new URL(location.href)) < FRESH_MS) return;
    router.refresh();
  }, [pathname, router]);
  return null;
}
