"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/i18n/client";

// The numnum pages behind the current one in this tab, like the phone's own back stack: a new
// page is pushed, going back pops it. Back buttons use it to return to where the person came from
// (never stacking another copy of a page), and to fall back to a sensible page when there's
// nothing to go back to (opened from a shared link, a notification, the app's start).
const KEY = "nn_stack";
const MAX = 50;
let popAt = 0; // when the browser last went back/forward (set just before the new page renders)
let started = false;

function read(): string[] {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(s) ? s.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function write(s: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s.slice(-MAX)));
  } catch {
    // storage unavailable (private mode): back buttons fall back to their default page
  }
}

/** Keeps the stack in step with navigation. Mounted once, in the root layout. */
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => (popAt = Date.now());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    let s = read();
    const top = s[s.length - 1];
    if (!started) {
      started = true;
      // A fresh tab or app start begins here; a reload of the same page keeps its stack.
      if (top !== pathname) s = [pathname];
    } else if (top === pathname) {
      // same page (e.g. only the query changed)
    } else if (Date.now() - popAt < 2000 && s[s.length - 2] === pathname) {
      s.pop(); // went back
    } else {
      s.push(pathname);
    }
    popAt = 0;
    write(s);
  }, [pathname]);
  return null;
}

/** The numnum page before this one in the tab, if any. */
export function previousPage(): string | null {
  const s = read();
  return s.length > 1 ? s[s.length - 2] : null;
}

/** Back to the previous numnum page, or to `fallback` when there's none. */
export function goBack(router: { back: () => void; push: (href: string) => void }, fallback = "/") {
  if (previousPage()) router.back();
  else router.push(fallback);
}

export function BackButton({ fallback = "/", className = "-ms-2 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5" }: { fallback?: string; className?: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <button onClick={() => goBack(router, fallback)} className={className} aria-label={t("Back")} data-testid="back-button">
      <ChevronLeft className="rtl:-scale-x-100 h-6 w-6" />
    </button>
  );
}
