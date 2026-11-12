"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHydrated } from "@/components/customer/cart";

/**
 * Screens kept in the browser (next.config staleTimes) open instantly. On pages that must always be
 * current (restaurant dashboard, admin, the customer's account) this also fetches the latest version
 * right after each in-app navigation, so the screen updates a moment later. A page that was just
 * loaded from the server (first visit, reload) isn't fetched twice.
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
    router.refresh();
  }, [pathname, router]);
  return null;
}
