"use client";

import { useSearchParams } from "next/navigation";

/** All three result lists arrive with the page; switching tabs only changes the URL (no server round trip). */
export function ExploreResults({ dishes, reels, restaurants }: { dishes: React.ReactNode; reels: React.ReactNode; restaurants: React.ReactNode }) {
  const type = useSearchParams().get("type") ?? "dishes";
  return <>{type === "reels" ? reels : type === "restaurants" ? restaurants : dishes}</>;
}
