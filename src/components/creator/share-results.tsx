"use client";

import { useState, useTransition } from "react";
import Link from "@/components/link";
import { BadgeCheck, ExternalLink, Send } from "lucide-react";
import { setShareResultsAction } from "@/actions/creators";
import { ShareSheet } from "@/components/customer/share-sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * "Show my results to restaurants": a public page of the orders their reels brought (counted by
 * numnum), to send to a restaurant that might pay them to tag a dish. Listed in Find creators too.
 */
export function ShareResultsCard({ handle, initial, completedOrders }: { handle: string; initial: boolean; completedOrders: number }) {
  const t = useT();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [share, setShare] = useState(false);
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await setShareResultsAction(next);
      if (!r.ok) {
        setOn(!next);
        toast(t(r.error), "error");
      } else toast(t(r.message ?? "Saved"), "success");
    });
  };
  return (
    <section className="card overflow-hidden" data-testid="share-results">
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{t("Show my results to restaurants")}</div>
          <p className="mt-0.5 text-sm text-ink-soft">{t("A page with the orders your reels brought, counted by numnum. Restaurants trust real numbers: send it when you offer to tag their dish. You also appear in their Find creators list.")}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} disabled={pending} onClick={toggle} className={cn("relative h-7 w-12 shrink-0 rounded-full transition", on ? "bg-emerald-500" : "bg-black/15")} data-testid="share-results-toggle" aria-label={t("Show my results to restaurants")}>
          <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "start-[22px]" : "start-0.5")} />
        </button>
      </div>
      {on && (
        <div className="grid grid-cols-2 gap-2 border-t border-black/5 p-3">
          <button type="button" onClick={() => setShare(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white active:scale-[0.98]" data-testid="share-results-send">
            <Send className="h-4 w-4" /> {t("Send to a restaurant")}
          </button>
          <Link href={`/c/${handle}/results`} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black/5 text-sm font-bold active:scale-[0.98]" data-testid="share-results-open">
            <ExternalLink className="h-4 w-4" /> {t("See my results page")}
          </Link>
        </div>
      )}
      {share && (
        <ShareSheet
          open
          onClose={() => setShare(false)}
          title={t("My results")}
          message={t(completedOrders === 1 ? "My numnum results: 1 order from my food reels, counted by numnum. Let's work together:" : "My numnum results: {n} orders from my food reels, counted by numnum. Let's work together:", { n: completedOrders })}
          path={`/c/${handle}/results`}
        />
      )}
    </section>
  );
}
