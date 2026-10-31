"use client";

import { useEffect, useState } from "react";
import { InstallHelp } from "@/components/install-guide";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { isInstalled, isMobile } from "@/lib/push-client";
import { useT } from "@/i18n/client";

const KEY = "nn-install-later";

/**
 * Asks customers to add numnum to their home screen at the moment it's worth it: right after an
 * order, for live updates. "Maybe later" hides it for that order; the next order asks again.
 * With `open`/`onClose` it's shown on demand instead (e.g. a "Show me how" button).
 */
export function InstallSheet({ reference, open, onClose }: { reference?: string; open?: boolean; onClose?: () => void }) {
  const t = useT();
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!reference || !isMobile() || isInstalled()) return;
    // Automated test browsers skip it; `?install=preview` shows it anyway.
    if (navigator.webdriver && !location.search.includes("install=preview")) return;
    let later: string | null = null;
    try {
      later = localStorage.getItem(KEY);
    } catch {}
    if (later === reference) return;
    // Let the "Order sent" confirmation show first.
    const t = setTimeout(() => setAuto(true), 1500);
    return () => clearTimeout(t);
  }, [reference]);

  const close = () => {
    if (auto && reference) {
      try {
        localStorage.setItem(KEY, reference);
      } catch {}
    }
    setAuto(false);
    onClose?.();
  };

  return (
    <Sheet open={auto || !!open} onClose={close}>
      <div className="px-5 pb-6 pt-8">
        <div className="text-center">
          <div className="text-5xl" aria-hidden>
            🛵
          </div>
          <h2 className="mt-2 text-xl font-extrabold leading-tight">{t("Know the moment your order is on its way")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">Add numnum to your home screen and we&apos;ll notify you when the restaurant accepts your order, when it leaves and when it arrives.</p>
        </div>
        <div className="mt-5">
          <InstallHelp />
        </div>
        <Button type="button" variant="ghost" block className="mt-3" onClick={close}>
          {t("Maybe later")}
        </Button>
      </div>
    </Sheet>
  );
}
