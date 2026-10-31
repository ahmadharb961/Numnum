"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div>
        <div className="text-5xl">😵‍💫</div>
        <h1 className="mt-4 text-xl font-black">{t("Something went wrong")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{error.message?.includes("Requires") ? error.message : t("Please try again. If it keeps happening, check your connection.")}</p>
        <button onClick={reset} className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 font-semibold text-white">
          {t("Try again")}
        </button>
      </div>
    </main>
  );
}
