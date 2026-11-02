"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";

/** One-off messages carried in the URL after a redirect (e.g. ?account=deleted). */
export function QueryToast() {
  const sp = useSearchParams();
  const toast = useToast();
  const t = useT();
  useEffect(() => {
    if (sp.get("account") !== "deleted") return;
    toast(t("Your account was deleted. Thanks for trying numnum."), "success");
    const u = new URL(location.href);
    u.searchParams.delete("account");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }, [sp, toast, t]);
  return null;
}
