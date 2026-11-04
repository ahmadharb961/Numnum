"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isAndroid, isIos, isNativeApp } from "@/lib/push-client";

type Links = { ios: string; android: string };
const Ctx = createContext<Links>({ ios: "", android: "" });

/** The numnum app's store pages (Admin → Settings), shared with every page. */
export function AppLinksProvider({ links, children }: { links: Links; children: React.ReactNode }) {
  return <Ctx.Provider value={links}>{children}</Ctx.Provider>;
}

/**
 * The store page for this phone, once the app is live there: Google Play on Android, the App Store
 * on iPhone. Null on computers, inside the app itself, or while no link is set, so the
 * "add to home screen" guide is shown instead.
 */
export function useStoreLink(): { store: "ios" | "android"; url: string } | null {
  const links = useContext(Ctx);
  const [link, setLink] = useState<{ store: "ios" | "android"; url: string } | null>(null);
  useEffect(() => {
    if (isNativeApp()) return setLink(null);
    if (isAndroid() && links.android) return setLink({ store: "android", url: links.android });
    if (isIos() && links.ios) return setLink({ store: "ios", url: links.ios });
    setLink(null);
  }, [links.ios, links.android]);
  return link;
}
