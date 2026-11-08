"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, UserRound } from "lucide-react";

/** Mobile: Tasks / My Tasks tab bar with a floating "Post a Task" button. */
export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/admin") || path === "/post" || path.startsWith("/login") || path.startsWith("/signup")) return null;

  const tab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold transition ${
        active ? "text-brand-600" : "text-ink-muted"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
      {label}
    </Link>
  );

  // The floating button only where it doesn't cover the page's own main action.
  const showFab = path === "/" || path === "/my";

  return (
    <>
      {/* spacer so content isn't hidden behind the bar */}
      <div className={`${showFab ? "h-36" : "h-20"} md:hidden`} aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
        {showFab && (
        <div className="pointer-events-auto mx-auto mb-3 flex w-full max-w-md justify-center px-6">
          <Link
            href="/post"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-4 text-lg font-semibold text-white shadow-fab transition active:scale-[.98]"
          >
            <Plus className="h-6 w-6" aria-hidden /> Post a Task
          </Link>
        </div>
        )}
        <nav
          className="pointer-events-auto flex border-t border-ink/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          aria-label="Tabs"
        >
          {tab("/", "Tasks", Home, path === "/" || path.startsWith("/t/"))}
          {tab("/my", "My Tasks", UserRound, path.startsWith("/my") || path.startsWith("/profile") || path.startsWith("/pay"))}
        </nav>
      </div>
    </>
  );
}
