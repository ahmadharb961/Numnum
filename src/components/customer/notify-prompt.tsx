"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import { lastPushError, pushState, resyncDevice, sendTestNotification, turnOn, type PushState } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { InstallSheet } from "./install-sheet";
import { useT } from "@/i18n/client";
import { useStoreLink } from "@/components/app-links";

/** "Get order updates on your phone": lets a signed-in customer turn on push notifications. */
export function NotifyPrompt({ compact }: { compact?: boolean }) {
  const t = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const store = useStoreLink();
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string | null } | null>(null);

  useEffect(() => {
    void pushState().then((s) => {
      setState(s);
      if (s === "on") void resyncDevice();
    });
  }, []);

  if (state === null || state === "unsupported") return null;
  if (state === "on")
    return compact ? null : (
      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-5 w-5" /> {t("Order notifications are on for this device")}
        </div>
        <button
          type="button"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setTest(null);
            setTest(await sendTestNotification());
            setTesting(false);
          }}
          className="mt-2 text-xs font-bold text-emerald-900 underline disabled:opacity-60"
          data-testid="send-test-notification"
        >
          {testing ? t("Sending…") : t("Send me a test notification")}
        </button>
        {test?.ok && <p className="mt-1 text-xs">{t("Sent. It should arrive in a few seconds.")}</p>}
        {test && !test.ok && (
          <p className="mt-1 text-xs font-medium text-red-600">
            {t("The test notification couldn't be sent.")} <span className="font-normal text-ink-muted">({test.detail})</span>
          </p>
        )}
      </div>
    );

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-600">{state === "blocked" ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{t("Get order updates on your phone")}</div>
        {(state === "off" || state === "error") && (
          <>
            <p className="mt-0.5 text-ink-muted">We&apos;ll tell you when your order is accepted, on its way and delivered.</p>
            <Button
              size="sm"
              className="mt-2"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setState(await turnOn());
                setBusy(false);
              }}
            >
              {t(state === "error" ? "Try again" : "Turn on notifications")}
            </Button>
            {state === "error" && <p className="mt-2 text-xs font-medium text-red-600">{t("Couldn't turn on notifications. Check your internet connection and try again.")}{lastPushError && <span className="mt-1 block text-[11px] font-normal text-ink-muted">({lastPushError})</span>}</p>}
          </>
        )}
        {state === "ios-needs-install" && (
          <>
            <p className="mt-0.5 text-ink-muted">{t(store ? "Get the numnum app to receive order notifications on your iPhone." : "On iPhone, add numnum to your home screen first, then turn notifications on from there.")}</p>
            <Button size="sm" className="mt-2" onClick={() => setGuide(true)}>
              {t(store ? "Get the app" : "Show me how")}
            </Button>
            <InstallSheet open={guide} onClose={() => setGuide(false)} />
          </>
        )}
        {state === "blocked" && <p className="mt-0.5 text-ink-muted">{t("Notifications are blocked for numnum. Allow them in your phone or browser settings, then reopen this page.")}</p>}
      </div>
    </div>
  );
}
