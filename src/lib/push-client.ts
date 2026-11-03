// Browser side of notifications (adapted from Hireel). The phone always asks the person; code can't force the permission.

export type PushState = "unsupported" | "ios-needs-install" | "blocked" | "off" | "on";

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isMobile = () => isIos() || isAndroid();
/** Running inside the numnum store app (Capacitor adds "NumnumApp" to the user agent). */
export const isNativeApp = () => typeof navigator !== "undefined" && /NumnumApp\//.test(navigator.userAgent);
export const isInstalled = () => isNativeApp() || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// Browser (web) push; inside the store app, notifications go through the phone's native push instead.
const supported = () => !isNativeApp() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// ── Inside the store app: the phone's own notifications (Capacitor's PushNotifications plugin) ──
type Perm = { receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type Listener = { remove: () => Promise<void> };
type NativePush = {
  checkPermissions(): Promise<Perm>;
  requestPermissions(): Promise<Perm>;
  register(): Promise<void>;
  addListener(event: "registration", cb: (t: { value: string }) => void): Promise<Listener>;
  addListener(event: "registrationError", cb: (e: unknown) => void): Promise<Listener>;
  addListener(event: "pushNotificationActionPerformed", cb: (a: { notification: { data?: Record<string, unknown> } }) => void): Promise<Listener>;
  createChannel?(c: { id: string; name: string; description?: string; importance: number; sound?: string; vibration?: boolean; visibility?: number; lights?: boolean; lightColor?: string }): Promise<void>;
};
type CapacitorGlobal = { getPlatform(): string; Plugins: { PushNotifications?: NativePush } };
const capacitor = () => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);
/** The app's notification plugin (absent in app versions released before notifications existed). */
const nativePush = () => (isNativeApp() ? (capacitor()?.Plugins.PushNotifications ?? null) : null);
const nativePlatform = () => (capacitor()?.getPlatform() === "ios" ? "ios" : "android");

/** Asks the phone for this app's notification token (the phone answers with an event). */
function nativeToken(np: NativePush): Promise<string | null> {
  return new Promise((resolve) => {
    const subs: Promise<Listener>[] = [];
    const done = (v: string | null) => {
      clearTimeout(timer);
      subs.forEach((l) => void l.then((x) => x.remove()).catch(() => {}));
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 15_000);
    subs.push(np.addListener("registration", (t) => done(t.value)));
    subs.push(np.addListener("registrationError", () => done(null)));
    np.register().catch(() => done(null));
  });
}

async function saveNative(np: NativePush, test = false) {
  const token = await nativeToken(np);
  if (!token) return false;
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ native: { platform: nativePlatform(), token }, test }) });
  return r.ok;
}

let appReady = false;
/** Once per page load in the app: the Android channel, and opening the page a tapped notification points to. */
export function setUpAppNotifications() {
  const np = nativePush();
  if (!np || appReady) return;
  appReady = true;
  // High importance: new orders ring and pop up on the screen.
  void np.createChannel?.({ id: "orders", name: "Orders & updates", description: "New orders, order updates and news from numnum", importance: 5, sound: "default", vibration: true, visibility: 1, lights: true, lightColor: "#FF5412" }).catch(() => {});
  void np.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = typeof notification.data?.url === "string" ? notification.data.url : "/";
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
    const p = (await np.checkPermissions()).receive;
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

/** Must be called from a tap: shows the phone's own "Allow notifications?" question. */
export async function turnOn(): Promise<PushState> {
  const np = nativePush();
  if (np) {
    const p = (await np.requestPermissions()).receive;
    if (p !== "granted") return p === "denied" ? "blocked" : "off";
    return (await saveNative(np, true)) ? "on" : "off";
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
