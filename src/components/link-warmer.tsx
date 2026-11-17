"use client";

import { useEffect } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useRouter } from "next/navigation";
import { prefetchPage, registerAppNavigate } from "@/lib/prefetch";
import { forgetScreenTimes, markScreenFetched } from "@/lib/page-fetch-times";

// Screens kept loaded even when their link isn't on screen (tab bar, the dashboard's menu…).
const kept = new Map<string, number>();
let keptRouter: AppRouterInstance | null = null;

/**
 * Keep these screens loaded while the calling component is shown (and again after each refresh).
 * `ready` false waits (e.g. until the first reel plays, so it never slows the video down).
 */
export function useKeepLoaded(hrefs: string[], ready = true) {
  const router = useRouter();
  const key = hrefs.join("\n");
  useEffect(() => {
    if (!ready) return;
    const list = key.split("\n").filter(Boolean);
    keptRouter = router;
    for (const h of list) {
      kept.set(h, (kept.get(h) ?? 0) + 1);
      if (h !== location.pathname) prefetchPage(router, h);
    }
    return () => {
      for (const h of list) {
        const n = (kept.get(h) ?? 1) - 1;
        if (n > 0) kept.set(h, n);
        else kept.delete(h);
      }
    };
  }, [key, ready, router]);
}

/**
 * Keeps the screens behind the links on screen loaded, so a tap opens them at once.
 *
 * Links load their screen in advance when they appear (see components/link.tsx). But Next forgets
 * every screen loaded in advance whenever the current page refreshes (FreshOnNavigate, after
 * saving something, a server action). The links don't load again by themselves, so the next tap
 * would wait for the server. This notices those moments and loads the visible links again.
 * Already-loaded screens aren't fetched twice, so calling it more often than needed costs nothing.
 */
export function LinkWarmer() {
  const router = useRouter();
  useEffect(() => {
    registerAppNavigate((href) => router.push(href));
    return () => registerAppNavigate(null);
  }, [router]);
  useEffect(() => {
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
    });
    const watch = (root: Element | Document) => {
      if (root instanceof Element && root.matches("a[data-pf]")) io.observe(root);
      root.querySelectorAll("a[data-pf]").forEach((a) => io.observe(a));
    };
    watch(document);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => n instanceof Element && watch(n));
        r.removedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (visible.delete(n)) io.unobserve(n);
          n.querySelectorAll("a[data-pf]").forEach((a) => visible.delete(a) && io.unobserve(a));
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const warm = () => {
      for (const a of visible) {
        const href = a.getAttribute("href");
        if (a.isConnected && href && href.startsWith("/")) prefetchPage(router, href);
      }
      for (const href of kept.keys()) if (href !== location.pathname) prefetchPage(keptRouter ?? router, href);
    };
    // The forgetting happens once the refreshed page arrives: load again just after, and once more
    // a moment later in case that page took longer to come in.
    const rewarm = () => {
      for (const ms of [300, 1500]) {
        const t = setTimeout(() => {
          timers.delete(t);
          warm();
        }, ms);
        timers.add(t);
      }
    };

    // Refreshes and server actions both go through fetch: watch for them (without changing them).
    const original = window.fetch;
    const wrapped: typeof fetch = function (this: unknown, input, init) {
      const result = original.call(this, input, init);
      try {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const action = headers.has("next-action");
        const refresh = headers.has("rsc") && !headers.has("next-router-prefetch") && url.pathname === location.pathname;
        if (action) forgetScreenTimes();
        if (action || refresh) result.then(rewarm, () => {});
        // Any screen coming from the server (loaded in advance, opened, refreshed) is fresh now.
        if (headers.has("rsc") && !action) result.then((r) => r.ok && markScreenFetched(url), () => {});
      } catch {}
      return result;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
      io.disconnect();
      mo.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [router]);
  return null;
}

/** For server pages: keep a short list of screens (e.g. a menu) loaded, even the ones further down. */
export function KeepLoaded({ hrefs }: { hrefs: string[] }) {
  useKeepLoaded(hrefs);
  return null;
}
