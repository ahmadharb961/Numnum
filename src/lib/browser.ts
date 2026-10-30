// Which browser the page is in, for the "add to home screen" guides. Client-side only.

export type InApp = "Instagram" | "Facebook" | "TikTok" | "Snapchat" | "LinkedIn" | "X" | null;
export type BrowserKind = "safari" | "chrome-ios" | "other-ios" | "chrome-android" | "other-android" | "desktop";

/** Apps that open links in their own browser, where "Add to Home Screen" isn't available. */
export function inAppBrowser(ua = navigator.userAgent): InApp {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) return "Facebook";
  if (/musical_ly|TikTok|Bytedance|BytedanceWebview/i.test(ua)) return "TikTok";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Twitter/i.test(ua)) return "X";
  return null;
}

export function browserKind(ua = navigator.userAgent): BrowserKind {
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/CriOS/.test(ua)) return "chrome-ios";
    if (/FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua) || inAppBrowser(ua)) return "other-ios";
    return "safari";
  }
  if (/Android/i.test(ua)) return /Chrome\//.test(ua) && !/SamsungBrowser|EdgA|OPR|Firefox/.test(ua) && !inAppBrowser(ua) ? "chrome-android" : "other-android";
  return "desktop";
}

/** Safari 26+ hides Share behind the ⋯ button in the bottom bar. */
export function safariVersion(ua = navigator.userAgent) {
  const m = ua.match(/Version\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Link that opens the current page in the phone's real browser, where the OS allows it. */
export function externalBrowserUrl(href = location.href) {
  const u = new URL(href);
  if (/Android/i.test(navigator.userAgent)) return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  // iOS 17+ understands this scheme in many in-app browsers; it does nothing where it isn't supported.
  return `x-safari-https://${u.host}${u.pathname}${u.search}`;
}

// Android's one-tap install prompt fires once, early in the page load, so it's caught globally
// (see InstallPromptListener) and handed to whichever screen asks for it later.
export type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<(e: BIPEvent | null) => void>();
export function setInstallPrompt(e: BIPEvent | null) {
  deferred = e;
  listeners.forEach((l) => l(e));
}
export function getInstallPrompt() {
  return deferred;
}
export function onInstallPrompt(l: (e: BIPEvent | null) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
