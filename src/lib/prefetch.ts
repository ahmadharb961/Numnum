import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type Options = Parameters<AppRouterInstance["prefetch"]>[1];
// Next's "full" kind: the whole page (with its data), not just its loading screen.
const FULL = { kind: "full" } as unknown as Options;

/** Load a page completely in the background, so opening it is instant (kept for a few minutes). */
export function prefetchPage(router: AppRouterInstance, href: string) {
  router.prefetch(href, FULL);
}

// Opening a page from outside React (a tapped notification): change screen inside the app (instant,
// keeps everything loaded) once the app is running; before that, a normal page load.
let appNavigate: ((href: string) => void) | null = null;

export function registerAppNavigate(fn: ((href: string) => void) | null) {
  appNavigate = fn;
}

export function openInApp(href: string) {
  if (appNavigate) appNavigate(href);
  else location.assign(href);
}
