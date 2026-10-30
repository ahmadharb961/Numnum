"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronLeft, ChevronRight, Copy, Ellipsis, EllipsisVertical, ExternalLink, Home, Lock, PlusSquare, Share, X } from "lucide-react";
import { browserKind, externalBrowserUrl, getInstallPrompt, inAppBrowser, onInstallPrompt, safariVersion, setInstallPrompt, type BIPEvent, type BrowserKind, type InApp } from "@/lib/browser";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

/** Mounted once in the root layout: keeps Android's one-tap install prompt for later. */
export function InstallPromptListener() {
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BIPEvent);
    };
    const done = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", on);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return null;
}

export function useInstallPrompt() {
  const [e, setE] = useState<BIPEvent | null>(null);
  useEffect(() => {
    setE(getInstallPrompt());
    return onInstallPrompt(setE);
  }, []);
  return e;
}

// ---------------------------------------------------------------------------------------------
// Mock phone screens: a small drawing of what the person sees, with the button to tap pulsing.

function Target({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-grid place-items-center", className)}>
      <span className="absolute -inset-1.5 animate-ping rounded-full bg-brand-500/40" />
      <span className="absolute -inset-1 rounded-full ring-2 ring-brand-500" />
      <span className="relative">{children}</span>
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -ml-3 animate-tap text-2xl leading-none drop-shadow" aria-hidden>
        👆
      </span>
    </span>
  );
}

function RowTarget({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 animate-pulse rounded-lg bg-brand-500/15 ring-2 ring-brand-500" />
      <div className="relative flex items-center justify-between px-3 py-2 font-semibold text-brand-700">{children}</div>
      <span className="pointer-events-none absolute right-6 top-1/2 z-10 animate-tap text-2xl drop-shadow" aria-hidden>
        👆
      </span>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between px-3 py-2 text-ink-soft">{children}</div>;
}

const AppIcon = ({ size = "h-10 w-10" }: { size?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/icons/icon-192.png" alt="" className={cn(size, "rounded-[22%] shadow")} />
);

function Page({ children, bar, barTop }: { children?: React.ReactNode; bar?: React.ReactNode; barTop?: boolean }) {
  return (
    <div className="relative flex h-full flex-col bg-white">
      {barTop && bar}
      <div className="relative flex-1 overflow-hidden">
        <div className="space-y-1.5 p-3 opacity-60">
          <Logo className="h-6 text-brand-600" />
          <div className="h-12 rounded-lg bg-gradient-to-br from-brand-200 to-brand-100" />
          <div className="h-2 w-2/3 rounded bg-black/10" />
          <div className="h-2 w-1/2 rounded bg-black/10" />
        </div>
        {children}
      </div>
      {!barTop && bar}
    </div>
  );
}

const Url = ({ className }: { className?: string }) => (
  <span className={cn("flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-black/[0.06] px-2 py-1.5 text-[11px] font-medium text-ink-soft", className)}>
    <Lock className="h-3 w-3" /> numnum.me
  </span>
);

const SafariBar26 = () => (
  <Page
    bar={
      <div className="flex items-center gap-2 border-t border-black/5 bg-white/95 px-3 pb-6 pt-2.5">
        <ChevronLeft className="h-5 w-5 text-sky-500" />
        <Url />
        <Target>
          <Ellipsis className="h-5 w-5 text-ink" />
        </Target>
      </div>
    }
  />
);

const SafariBarClassic = () => (
  <Page
    bar={
      <div className="border-t border-black/5 bg-white/95">
        <div className="px-3 pt-2">
          <Url />
        </div>
        <div className="flex items-center justify-around px-3 pb-6 pt-2.5 text-sky-500">
          <ChevronLeft className="h-5 w-5" />
          <ChevronRight className="h-5 w-5 opacity-40" />
          <Target>
            <Share className="h-5 w-5" />
          </Target>
          <BookOpen className="h-5 w-5" />
          <Copy className="h-5 w-5" />
        </div>
      </div>
    }
  />
);

const SafariMenu = () => (
  <Page>
    <div className="absolute inset-x-6 bottom-2 rounded-2xl bg-white p-1 text-xs shadow-2xl ring-1 ring-black/10">
      <RowTarget>
        Share <Share className="h-4 w-4" />
      </RowTarget>
      <Row>Add to Bookmarks</Row>
      <Row>Find on Page</Row>
    </div>
  </Page>
);

const ShareSheet = () => (
  <Page>
    <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-neutral-100 p-2 text-xs shadow-2xl">
      <div className="mb-1.5 flex gap-2 px-1">
        {["bg-emerald-400", "bg-green-500", "bg-sky-500", "bg-amber-400"].map((c) => (
          <span key={c} className={cn("h-7 w-7 rounded-full", c)} />
        ))}
      </div>
      <div className="rounded-xl bg-white">
        <Row>
          Copy <Copy className="h-4 w-4" />
        </Row>
        <RowTarget>
          Add to Home Screen <PlusSquare className="h-4 w-4" />
        </RowTarget>
      </div>
    </div>
  </Page>
);

const AddDialog = ({ action = "Add" }: { action?: string }) => (
  <div className="flex h-full flex-col bg-neutral-100 text-xs">
    <div className="flex items-center justify-between bg-white px-3 py-2.5">
      <span className="text-sky-500">Cancel</span>
      <b>Add to Home Screen</b>
      <Target>
        <b className="px-1 text-sky-500">{action}</b>
      </Target>
    </div>
    <div className="m-3 flex items-center gap-3 rounded-xl bg-white p-3">
      <AppIcon />
      <div>
        <div className="font-bold">numnum</div>
        <div className="text-ink-muted">numnum.me</div>
      </div>
    </div>
  </div>
);

const HomeScreen = ({ name }: { name: string }) => (
  <div className="grid h-full grid-cols-4 content-center gap-x-3 gap-y-3 bg-gradient-to-br from-sky-300 via-indigo-300 to-fuchsia-300 px-5">
    {Array.from({ length: 6 }, (_, i) => (
      <span key={i} className="mx-auto h-10 w-10 rounded-[22%] bg-white/50" />
    ))}
    <span className="mx-auto flex flex-col items-center gap-0.5">
      <Target className="rounded-[22%]">
        <AppIcon />
      </Target>
      <span className="max-w-[56px] truncate text-[9px] font-semibold text-white drop-shadow">{name}</span>
    </span>
    <span className="mx-auto h-10 w-10 rounded-[22%] bg-white/50" />
  </div>
);

const ChromeTop = ({ icon }: { icon: "menu" | "share" }) => (
  <Page
    barTop
    bar={
      <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
        <Home className="h-4 w-4 text-ink-soft" />
        <Url />
        <Target>{icon === "menu" ? <EllipsisVertical className="h-5 w-5 text-ink" /> : <Share className="h-5 w-5 text-ink" />}</Target>
      </div>
    }
  />
);

const ChromeMenu = () => (
  <Page>
    <div className="absolute right-2 top-1 w-44 rounded-xl bg-white p-1 text-xs shadow-2xl ring-1 ring-black/10">
      <Row>New tab</Row>
      <Row>History</Row>
      <RowTarget>
        Add to home screen <PlusSquare className="h-4 w-4" />
      </RowTarget>
    </div>
  </Page>
);

const AndroidInstall = () => (
  <Page>
    <div className="absolute inset-0 grid place-items-center bg-black/30 p-4">
      <div className="w-full rounded-2xl bg-white p-3 text-xs shadow-2xl">
        <b className="text-sm">Add to home screen</b>
        <div className="mt-2 flex items-center gap-2">
          <AppIcon size="h-8 w-8" /> numnum
        </div>
        <div className="mt-3 flex justify-end gap-4 font-semibold text-sky-600">
          <span>Cancel</span>
          <Target>
            <span className="px-1">Install</span>
          </Target>
        </div>
      </div>
    </div>
  </Page>
);

const InAppTop = () => (
  <Page
    barTop
    bar={
      <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
        <X className="h-4 w-4 text-ink" />
        <Url className="bg-transparent" />
        <Target>
          <Ellipsis className="h-5 w-5 text-ink" />
        </Target>
      </div>
    }
  />
);

const InAppMenu = ({ label }: { label: string }) => (
  <Page>
    <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-2 text-xs shadow-2xl ring-1 ring-black/10">
      <Row>
        Copy link <Copy className="h-4 w-4" />
      </Row>
      <RowTarget>
        {label} <ExternalLink className="h-4 w-4" />
      </RowTarget>
    </div>
  </Page>
);

// ---------------------------------------------------------------------------------------------

type Step = { screen: React.ReactNode; text: React.ReactNode };

/** Auto-playing picture steps with a caption; tap the dots or arrows to move through them. */
function StepPlayer({ steps }: { steps: Step[] }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setI((n) => (n + 1) % steps.length), 3200);
    return () => clearInterval(t);
  }, [auto, steps.length]);
  const go = (n: number) => {
    setAuto(false);
    setI((n + steps.length) % steps.length);
  };
  return (
    <div>
      <div className="mx-auto w-full max-w-[300px] rounded-[2rem] bg-ink p-2 shadow-xl">
        <div key={i} className="h-[180px] animate-step-in overflow-hidden rounded-[1.5rem]">
          {steps[i].screen}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-black text-white">{i + 1}</span>
        <p key={i} className="min-h-[3rem] flex-1 animate-step-in pt-1 text-[15px] leading-snug">
          {steps[i].text}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(i - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-black/5" aria-label="Previous step">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {steps.map((_, n) => (
          <button key={n} type="button" onClick={() => go(n)} className={cn("h-2 rounded-full transition-all", n === i ? "w-6 bg-brand-500" : "w-2 bg-black/15")} aria-label={`Step ${n + 1}`} />
        ))}
        <button type="button" onClick={() => go(i + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-black/5" aria-label="Next step">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type ArrowAt = "bottom-right" | "bottom-center" | "top-right";

/** Bouncing arrow at the edge of the screen, pointing at the real browser button. */
export function PointerArrow({ at }: { at: ArrowAt }) {
  const top = at === "top-right";
  return (
    <div
      className={cn("pointer-events-none fixed z-[100] animate-bounce", at === "bottom-center" ? "left-1/2 -translate-x-1/2" : "right-3")}
      style={top ? { top: "calc(var(--safe-top) + 6px)" } : { bottom: "calc(var(--safe-bottom) + 6px)" }}
      aria-hidden
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-white shadow-lg ring-4 ring-white">{top ? <ArrowUp className="h-6 w-6" /> : <ArrowDown className="h-6 w-6" />}</span>
    </div>
  );
}

function installSteps(kind: BrowserKind, appName: string): { steps: Step[]; arrow: ArrowAt | null } {
  const open: Step = { screen: <HomeScreen name={appName} />, text: <>Open <b>{appName}</b> from your home screen. That&apos;s it!</> };
  if (kind === "safari" || kind === "other-ios") {
    const modern = safariVersion() >= 26;
    return {
      arrow: modern ? "bottom-right" : "bottom-center",
      steps: [
        modern
          ? { screen: <SafariBar26 />, text: <>Tap <b>⋯</b> at the bottom right of Safari.</> }
          : { screen: <SafariBarClassic />, text: <>Tap <Share className="inline h-4 w-4 align-text-bottom text-sky-500" /> <b>Share</b> at the bottom of Safari.</> },
        ...(modern ? [{ screen: <SafariMenu />, text: <>Tap <b>Share</b>.</> }] : []),
        { screen: <ShareSheet />, text: <>Scroll down and tap <b>Add to Home Screen</b> (tap “View More” if you don&apos;t see it).</> },
        { screen: <AddDialog />, text: <>Tap <b>Add</b> at the top right.</> },
        open,
      ],
    };
  }
  if (kind === "chrome-ios")
    return {
      arrow: "top-right",
      steps: [
        { screen: <ChromeTop icon="share" />, text: <>Tap <Share className="inline h-4 w-4 align-text-bottom" /> <b>Share</b> next to the address bar.</> },
        { screen: <ShareSheet />, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
        { screen: <AddDialog />, text: <>Tap <b>Add</b>.</> },
        open,
      ],
    };
  return {
    arrow: kind === "chrome-android" ? "top-right" : null,
    steps: [
      { screen: <ChromeTop icon="menu" />, text: <>Tap <b>⋮</b> at the top right of {kind === "chrome-android" ? "Chrome" : "your browser"}.</> },
      { screen: <ChromeMenu />, text: <>Tap <b>Add to home screen</b> (or <b>Install app</b>).</> },
      { screen: <AndroidInstall />, text: <>Tap <b>Install</b>.</> },
      open,
    ],
  };
}

/** Inside Instagram, TikTok…: "Add to Home Screen" only works in the phone's real browser. */
export function OpenInBrowser({ app }: { app: Exclude<InApp, null> }) {
  const [copied, setCopied] = useState(false);
  const android = /Android/i.test(navigator.userAgent);
  const browser = android ? "Chrome" : "Safari";
  const label = android ? (app === "TikTok" ? "Open in browser" : "Open in Chrome") : app === "TikTok" ? "Open in browser" : "Open in external browser";
  return (
    <div>
      <h2 className="text-xl font-extrabold leading-tight">First, open numnum in {browser}</h2>
      <p className="mt-1 text-ink-soft">
        You&apos;re inside {app}&apos;s browser, which can&apos;t add apps to your home screen.
      </p>
      <a href={externalBrowserUrl()} className={buttonClass("primary", "lg", "mt-4 w-full")}>
        <ExternalLink className="h-5 w-5" /> Open in {browser}
      </a>
      <p className="mb-4 mt-4 text-center text-sm text-ink-muted">If nothing happens, do it from the {app} menu:</p>
      <StepPlayer
        steps={[
          { screen: <InAppTop />, text: <>Tap <b>⋯</b> at the top right of the screen.</> },
          { screen: <InAppMenu label={label} />, text: <>Tap <b>{label}</b>.</> },
        ]}
      />
      <Button
        type="button"
        variant="outline"
        block
        className="mt-4"
        onClick={async () => {
          await navigator.clipboard?.writeText(location.href).catch(() => {});
          setCopied(true);
        }}
      >
        <Copy className="h-4 w-4" /> {copied ? `Link copied: paste it in ${browser}` : "Copy link"}
      </Button>
      <PointerArrow at="top-right" />
    </div>
  );
}

/** The right guide for this phone: open-in-browser first, Android's one-tap install, or picture steps. */
export function InstallHelp({ appName = "numnum", arrow = true }: { appName?: string; arrow?: boolean }) {
  const prompt = useInstallPrompt();
  const [env, setEnv] = useState<{ inApp: InApp; kind: BrowserKind } | null>(null);
  useEffect(() => setEnv({ inApp: inAppBrowser(), kind: browserKind() }), []);
  if (!env) return null;
  if (env.inApp) return <OpenInBrowser app={env.inApp} />;
  const { steps, arrow: at } = installSteps(env.kind, appName);
  return (
    <div>
      {prompt && (
        <>
          <Button
            size="lg"
            block
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setInstallPrompt(null);
            }}
          >
            <PlusSquare className="h-5 w-5" /> Add {appName} to home screen
          </Button>
          <p className="mb-4 mt-4 text-center text-sm text-ink-muted">Or add it from the browser menu:</p>
        </>
      )}
      <StepPlayer steps={steps} />
      {env.kind === "other-ios" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">If you can&apos;t find it, open numnum.me in <b>Safari</b>.</p>}
      {arrow && at && !prompt && <PointerArrow at={at} />}
    </div>
  );
}
