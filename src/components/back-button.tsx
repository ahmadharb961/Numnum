"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/i18n/client";

const KEY = "nn_pages";

/** Counts pages seen in this tab, so a back button knows whether there's a numnum page to return to. */
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, String(Number(sessionStorage.getItem(KEY) ?? 0) + 1));
    } catch {
      // storage unavailable (private mode): back buttons fall back to their default page
    }
  }, [pathname]);
  return null;
}

/** Back to the previous numnum page, or to `fallback` when the page was opened directly. */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const t = useT();
  const router = useRouter();
  const back = () => {
    let seen = 0;
    try {
      seen = Number(sessionStorage.getItem(KEY) ?? 0);
    } catch {}
    if (seen > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button onClick={back} className="-ms-2 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5" aria-label={t("Back")}>
      <ChevronLeft className="rtl:-scale-x-100 h-6 w-6" />
    </button>
  );
}
