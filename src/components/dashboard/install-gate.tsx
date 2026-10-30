"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import { isAndroid, isInstalled, isIos, isMobile, pushState, resyncDevice, turnOn, type PushState } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Step = "loading" | "install" | "notify" | "blocked" | "ok";

/**
 * Restaurants must receive new orders instantly. On phones, the dashboard only opens
 * from the home-screen app with notifications allowed (iPhone only delivers web
 * notifications to home-screen apps). Desktop browsers get a reminder banner instead.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("loading");
  const [mobile, setMobile] = useState(false);
  const [push, setPush] = useState<PushState>("off");
  const [bip, setBip] = useState<BIPEvent | null>(null);
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
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const onVis = () => document.visibilityState === "visible" && void evaluate();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
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
        <div className="text-2xl font-black tracking-tight text-brand-600">numnum</div>
        <ol className="mt-6 flex gap-2 text-xs font-bold">
          <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "install" ? "bg-ink text-white" : "bg-emerald-100 text-emerald-700"}`}>1. Add to home screen</li>
          <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "install" ? "bg-black/5 text-ink-muted" : "bg-ink text-white"}`}>2. Allow notifications</li>
        </ol>

        {step === "install" && (
          <>
            <Smartphone className="mt-8 h-12 w-12 text-brand-500" />
            <h1 className="mt-3 text-2xl font-extrabold leading-tight">Add numnum to your home screen to receive orders</h1>
            <p className="mt-2 text-ink-soft">Orders arrive as notifications, like a regular app, even when your phone is locked. This takes 20 seconds.</p>
            {isIos() ? (
              <ol className="mt-6 space-y-4 text-[15px]">
                <li className="flex gap-3"><Badge n={1} /> <span className="pt-0.5">Tap <Share className="mx-1 inline h-5 w-5 text-sky-500" /> <b>Share</b> at the bottom of Safari.</span></li>
                <li className="flex gap-3"><Badge n={2} /> <span className="pt-0.5">Scroll down and tap <PlusSquare className="mx-1 inline h-5 w-5" /> <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
                <li className="flex gap-3"><Badge n={3} /> <span className="pt-0.5">Open <b>numnum Orders</b> from your home screen and log in.</span></li>
                <li className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Use <b>Safari</b> (not Chrome or Instagram&apos;s browser) and iOS 16.4 or newer.</li>
              </ol>
            ) : (
              <>
                {bip ? (
                  <Button
                    size="lg"
                    block
                    className="mt-6"
                    onClick={async () => {
                      await bip.prompt();
                      await bip.userChoice;
                      setBip(null);
                    }}
                  >
                    <PlusSquare className="h-5 w-5" /> Install numnum Orders
                  </Button>
                ) : null}
                <ol className="mt-6 space-y-4 text-[15px]">
                  <li className="flex gap-3"><Badge n={1} /> <span className="pt-0.5">{isAndroid() ? <>In Chrome, tap <MoreVertical className="mx-1 inline h-5 w-5" /> (top right).</> : "Open your browser menu."}</span></li>
                  <li className="flex gap-3"><Badge n={2} /> <span className="pt-0.5">Tap <b>Add to Home screen</b> or <b>Install app</b>.</span></li>
                  <li className="flex gap-3"><Badge n={3} /> <span className="pt-0.5">Open <b>numnum Orders</b> from your home screen.</span></li>
                </ol>
              </>
            )}
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
              {isIos() ? <li>iPhone: <b>Settings → Notifications → numnum Orders → Allow Notifications</b></li> : <li>Android: <b>Settings → Apps → numnum Orders → Notifications → On</b></li>}
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

function Badge({ n }: { n: number }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{n}</span>;
}
