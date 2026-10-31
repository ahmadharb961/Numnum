"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSearching } from "./search-state";

/** All three result lists arrive with the page; switching tabs only changes the URL (no server round trip). */
export function ExploreResults({ dishes, reels, restaurants }: { dishes: React.ReactNode; reels: React.ReactNode; restaurants: React.ReactNode }) {
  const type = useSearchParams().get("type") ?? "dishes";
  const searching = useSearching();
  return (
    <div aria-busy={searching}>
      {searching && (
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
        </p>
      )}
      <div className={cn("transition-opacity duration-150", searching && "pointer-events-none opacity-40")}>{type === "reels" ? reels : type === "restaurants" ? restaurants : dishes}</div>
    </div>
  );
}
