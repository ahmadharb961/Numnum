"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "./track";
import { useT } from "@/i18n/client";

/** Shown instead of a blocked restaurant's page, dish or reel. */
export function BlockedNotice({ blockId, name }: { blockId: string; name: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 text-center" data-testid="blocked-notice">
      <div className="max-w-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-black/5"><EyeOff className="h-7 w-7 text-ink-muted" /></div>
        <h1 className="mt-4 text-xl font-black">{t("You blocked {name}", { name })}</h1>
        <p className="mt-1 text-ink-muted">{t("Their reels, dishes and page are hidden for you.")}</p>
        <div className="mt-6 grid gap-3">
          <Button
            variant="outline"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/blocks", { id: blockId }, "DELETE");
                toast(t("Unblocked"), "success");
                router.refresh();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Unblock")}
          </Button>
          <Link href="/" className={buttonClass("primary", "md")}>{t("Back to reels")}</Link>
        </div>
      </div>
    </main>
  );
}
