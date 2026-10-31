"use client";

import { useEffect } from "react";
import { loadSearchIndex } from "./instant-search";

/** Downloads the search index in the background once the page has settled, so the first search is instant. */
export function SearchPrefetch() {
  useEffect(() => {
    const run = () => void loadSearchIndex().catch(() => {});
    const t = setTimeout(() => ("requestIdleCallback" in window ? window.requestIdleCallback(run, { timeout: 3000 }) : run()), 3500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
