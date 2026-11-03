// Browser side of notifications (adapted from Hireel). The phone always asks the person; code can't force the permission.

/** "error": allowed, but the phone or the server didn't answer in time (try again). */
export type PushState = "unsupported" | "ios-needs-install" | "blocked" | "off" | "on" | "error";

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isMobile = () => isIos() || isAndroid();
/** Running inside the numnum store app (Capacitor adds "NumnumApp" to the user agent). */
export const isNativeApp = () => typeof navigator !== "undefined" && /NumnumApp\//.test(navigator.userAgent);
export const isInstalled = () => isNativeApp() || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// Browser (web) push; inside the store app, notifications go through the phone's native push instead.
const supported = () => !isNativeApp() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// ── Inside the store app: the phone's own notifications (Capacitor's PushNotifications plugin) ──
// The app exposes the plugin on window.Capacitor. Its addListener returns a handle directly (not a
// promise), and any call can fail or never answer, so every step below has a time limit.
type Perm = { receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type Listener = { remove: () => unknown };
type NativePush = {
  checkPermissions(): Promise<Perm>;
  requestPermissions(): Promise<Perm>;
  register(): Promise<void>;
  addListener(event: string, cb: (v: never) => void): Listener | Promise<Listener>;
  createChannel?(c: { id: string; name: string; description?: string; importance: number; sound?: string; vibration?: boolean; visibility?: number; lights?: boolean; lightColor?: string }): Promise<void>;
};
type CapacitorGlobal = { getPlatform(): string; Plugins: { PushNotifications?: NativePush } };
const capacitor = () => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);
/** The app's notification plugin (absent in app versions released before notifications existed). */
const nativePush = () => (isNativeApp() ? (capacitor()?.Plugins.PushNotifications ?? null) : null);
const nativePlatform = () => (capacitor()?.getPlatform() === "ios" ? "ios" : "android");

/** Why the last attempt to turn notifications on failed (shown under the button). */
export let lastPushError: string | null = null;

/** Resolves with the call's answer, or rejects after `ms` (a phone that never answers can't hang the page). */
function limit<T>(ms: number, what: string, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: no answer after ${Math.round(ms / 1000)} s`)), ms);
    Promise.resolve()
      .then(run)
      .then(
        (v) => (clearTimeout(t), resolve(v)),
        (e) => (clearTimeout(t), reject(e instanceof Error ? e : new Error(`${what}: ${String((e as { message?: string })?.message ?? e)}`))),
      );
  });
}

function listen(np: NativePush, event: string, cb: (v: never) => void) {
  // Works whether the app hands back the handle itself or a promise of it.
  const h = Promise.resolve().then(() => np.addListener(event, cb));
  return () => void h.then((x) => x?.remove()).catch(() => {});
}

/** Asks the phone for this app's notification address; it answers with an event. */
function nativeToken(np: NativePush): Promise<string> {
  const offs: (() => void)[] = [];
  return limit(20_000, "Phone notification address", () =>
    new Promise<string>((resolve, reject) => {
      offs.push(listen(np, "registration", (t: { value?: string }) => (t?.value ? resolve(t.value) : reject(new Error("empty notification address")))));
      offs.push(listen(np, "registrationError", (e: { error?: string }) => reject(new Error(e?.error || "the phone refused to register for notifications"))));
      void Promise.resolve()
        .then(() => np.register())
        .catch((e) => reject(e instanceof Error ? e : new Error(String(e))));
    }),
  ).finally(() => offs.forEach((off) => off()));
}

async function saveNative(np: NativePush, test = false) {
  const token = await nativeToken(np);
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ native: { platform: nativePlatform(), token }, test }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) throw new Error(r ? `server answered ${r.status}` : "couldn't reach numnum");
}

let appReady = false;
/** Once per page load in the app: the Android channel, and opening the page a tapped notification points to. */
export function setUpAppNotifications() {
  const np = nativePush();
  if (!np || appReady) return;
  appReady = true;
  // High importance: new orders ring and pop up on the screen.
  void Promise.resolve()
    .then(() => np.createChannel?.({ id: "orders", name: "Orders & updates", description: "New orders, order updates and news from numnum", importance: 5, sound: "default", vibration: true, visibility: 1, lights: true, lightColor: "#FF5412" }))
    .catch(() => {});
  listen(np, "pushNotificationActionPerformed", ({ notification }: { notification?: { data?: Record<string, unknown> } }) => {
    const url = typeof notification?.data?.url === "string" ? notification.data.url : "/";
    // Only our own pages (a path, or a full numnum.me address).
    const target = url.startsWith("/") ? url : url.startsWith(location.origin) ? url.slice(location.origin.length) || "/" : "/";
    if (target !== location.pathname + location.search) location.assign(target);
  });
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  const np = nativePush();
  if (np) {
    const p = await limit(8_000, "Notification permission", () => np.checkPermissions())
      .then((r) => r?.receive)
      .catch(() => undefined);
    return p === "granted" ? "on" : p === "denied" ? "blocked" : "off";
  }
  if (!supported()) return isIos() && !isInstalled() ? "ios-needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

async function save(sub: PushSubscription, test = false) {
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), test }) });
  return r.ok;
}

/**
 * Must be called from a tap: shows the phone's own "Allow notifications?" question. Never throws and
 * never hangs: when something fails it answers "error" and `lastPushError` says why.
 */
export async function turnOn(): Promise<PushState> {
  lastPushError = null;
  try {
    return await turnOnSteps();
  } catch (e) {
    lastPushError = e instanceof Error ? e.message : String(e);
    console.error("turning on notifications failed:", lastPushError);
    return "error";
  }
}

async function turnOnSteps(): Promise<PushState> {
  const np = nativePush();
  if (np) {
    // Generous limit: the person may take a moment to read the question.
    const p = (await limit(90_000, "Notification permission", () => np.requestPermissions()))?.receive;
    if (p !== "granted") return p === "denied" ? "blocked" : "off";
    await saveNative(np, true);
    return "on";
  }
  if (!supported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await fetch("/api/push").then((r) => r.json());
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  return (await save(sub, true)) ? "on" : "off";
}

/** When already allowed, make sure the server links this device to whoever is signed in now. */
export async function resyncDevice() {
  try {
    const np = nativePush();
    if (np) {
      if ((await np.checkPermissions()).receive === "granted") await saveNative(np);
      return;
    }
    if (!supported() || Notification.permission !== "granted") return;
    const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch {}
}
