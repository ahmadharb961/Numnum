"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-lavender hover:text-ink"
      onClick={async () => {
        const url = window.location.href.split("?")[0]!;
        if (navigator.share) {
          try {
            await navigator.share({ title, text: `${title} — on Yalla Ok`, url });
            return;
          } catch {
            /* cancelled */
          }
        }
        await navigator.clipboard?.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
