"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Share } from "lucide-react";
import { pushState, resyncDevice, turnOn, type PushState } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

/** "Get order updates on your phone": lets a signed-in customer turn on push notifications. */
export function NotifyPrompt({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then((s) => {
      setState(s);
      if (s === "on") void resyncDevice();
    });
  }, []);

  if (state === null || state === "unsupported") return null;
  if (state === "on")
    return compact ? null : (
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        <CheckCircle2 className="h-5 w-5" /> Order notifications are on for this device
      </div>
    );

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-600">{state === "blocked" ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">Get order updates on your phone</div>
        {state === "off" && (
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
              Turn on notifications
            </Button>
          </>
        )}
        {state === "ios-needs-install" && (
          <p className="mt-0.5 text-ink-muted">
            On iPhone, tap <Share className="inline h-4 w-4 align-text-bottom" /> Share → <b>Add to Home Screen</b>, then open numnum from your home screen and turn notifications on.
          </p>
        )}
        {state === "blocked" && <p className="mt-0.5 text-ink-muted">Notifications are blocked for numnum. Allow them in your phone or browser settings, then reopen this page.</p>}
      </div>
    </div>
  );
}
