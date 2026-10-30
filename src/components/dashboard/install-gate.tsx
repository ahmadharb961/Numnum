"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { isInstalled, isIos, isMobile, pushState, resyncDevice, turnOn, type PushState } from "@/lib/push-client";
import { InstallHelp } from "@/components/install-guide";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const APP = "numnum Orders";
type Step = "loading" | "install" | "notify" | "blocked" | "ok";

/**
 * On phones, the restaurant dashboard only opens from the home screen with notifications allowed
 * (iPhone only delivers web notifications to home-screen apps), so new orders arrive instantly.
 * Desktop browsers aren't gated; they get a reminder banner.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("loading");
  const [mobile, setMobile] = useState(false);
  const [push, setPush] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);

  async function evaluate() {
    const m = isMobile();
    setMobile(m);
    // Automated test browsers aren't restaurants; `?gate=preview` shows the gate anyway.
    const automated = navigator.webdriver && !location.search.includes("gate=preview");
    if (automated) return setStep("ok");
    const p = await pushState().catch(() => "unsupported" as PushState);
    setPush(p);
    if (p === "on") void resyncDevice();
    if (m && !isInstalled()) return setStep("install");
    if (p === "blocked") return setStep(m ? "blocked" : "ok");
    if (p === "off" && m) return setStep("notify");
    setStep("ok");
  }

  useEffect(() => {
    void evaluate();
    const onVis = () => document.visibilityState === "visible" && void evaluate();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function enable() {
    setBusy(true);
    const p = await turnOn().catch(() => "unsupported" as PushState);
    setPush(p);
    setBusy(false);
    if (p === "on" || p === "unsupported") setStep("ok");
    else if (p === "blocked") setStep("blocked");
  }

  if (step === "loading") return <>{children}</>;
  if (step === "ok")
    return (
      <>
        {!mobile && push !== "on" && push !== "unsupported" && (
          <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900 lg:ml-[18rem] lg:mr-8">
            <span className="inline-flex items-center gap-2 font-semibold">
              <BellRing className="h-4 w-4" /> {push === "blocked" ? "Notifications are blocked in this browser — allow them in the site settings to hear about new orders." : "Turn on notifications to be alerted about new orders even when this tab is in the background."}
            </span>
            {push === "off" && (
              <Button size="sm" onClick={enable} loading={busy}>
                Turn on
              </Button>
            )}
          </div>
        )}
        {children}
      </>
    );

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-cream" style={{ paddingTop: "calc(var(--safe-top) + 24px)", paddingBottom: "calc(var(--safe-bottom) + 24px)" }}>
      <div className="mx-auto max-w-md px-6">
        <Logo className="h-8 text-brand-600" />
        <ol className="mt-6 flex gap-2 text-xs font-bold">
          <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "install" ? "bg-ink text-white" : "bg-emerald-100 text-emerald-700"}`}>1. Add to home screen</li>
          <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "install" ? "bg-black/5 text-ink-muted" : "bg-ink text-white"}`}>2. Allow notifications</li>
        </ol>

        {step === "install" && (
          <>
            <h1 className="mt-6 text-2xl font-extrabold leading-tight">Add numnum to your home screen to receive orders</h1>
            <p className="mb-6 mt-2 text-ink-soft">Orders arrive as notifications, like a regular app, even when your phone is locked. This takes 20 seconds.</p>
            <InstallHelp appName={APP} />
          </>
        )}

        {step === "notify" && (
          <>
            <BellRing className="mt-8 h-12 w-12 text-brand-500" />
            <h1 className="mt-3 text-2xl font-extrabold leading-tight">Allow notifications for new orders</h1>
            <p className="mt-2 text-ink-soft">Your phone will ask for permission. Tap <b>Allow</b> so you never miss an order.</p>
            <Button size="lg" block className="mt-6" onClick={enable} loading={busy}>
              <BellRing className="h-5 w-5" /> Turn on order notifications
            </Button>
            {push === "unsupported" && <p className="mt-3 text-sm text-ink-muted">This phone doesn&apos;t support web notifications. Update your phone&apos;s software, or keep the Orders screen open.</p>}
          </>
        )}

        {step === "blocked" && (
          <>
            <BellRing className="mt-8 h-12 w-12 text-red-500" />
            <h1 className="mt-3 text-2xl font-extrabold leading-tight">Notifications are turned off</h1>
            <p className="mt-2 text-ink-soft">numnum needs notifications to alert you about new orders. Turn them back on, then reopen the app:</p>
            <ul className="mt-4 space-y-2 text-[15px]">
              {isIos() ? <li>iPhone: <b>Settings → Notifications → {APP} → Allow Notifications</b></li> : <li>Android: <b>Settings → Apps → {APP} → Notifications → On</b></li>}
            </ul>
            <Button size="lg" block variant="outline" className="mt-6" onClick={() => void evaluate()}>
              <CheckCircle2 className="h-5 w-5" /> I&apos;ve turned them on
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
