import "server-only";
import crypto from "node:crypto";
import http2 from "node:http2";
import type { PushMessage } from "./push";

/**
 * Notifications for the numnum store app. Its devices are saved with the browser ones, with an
 * endpoint of `native:android:<FCM token>` or `native:ios:<APNs token>`:
 *  - Android: Firebase Cloud Messaging (HTTP v1), signed with the Firebase service account.
 *  - iPhone: Apple's push service directly, signed with an APNs key from the Apple developer account.
 * Settings (Hostinger environment variables): FCM_SERVICE_ACCOUNT (the service-account JSON, as is or
 * base64), APNS_KEY (the .p8 file's text, as is, with \n, or base64), APNS_KEY_ID, APNS_TEAM_ID,
 * APNS_BUNDLE_ID (defaults to me.numnum.app).
 */

export const NATIVE_PREFIX = "native:";
export type NativePlatform = "android" | "ios";
/** ok: delivered to Apple/Google · gone: the app was removed, forget the device · error: try again next time */
export type SendResult = "ok" | "gone" | "error";

export function nativeEndpoint(platform: NativePlatform, token: string) {
  return `${NATIVE_PREFIX}${platform}:${token}`;
}

export function parseNativeEndpoint(endpoint: string): { platform: NativePlatform; token: string } | null {
  const m = /^native:(android|ios):(.+)$/.exec(endpoint);
  return m ? { platform: m[1] as NativePlatform, token: m[2] } : null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Reads a secret pasted in any of the usual ways: as is, with literal "\n", or base64-encoded. */
export function readSecret(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let v = raw.trim();
  if (!v.startsWith("{") && !v.includes("-----BEGIN")) {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    if (decoded.startsWith("{") || decoded.includes("-----BEGIN")) v = decoded.trim();
  }
  // A bare key pasted on one line with "\n" (JSON keeps its own escapes, parsed later).
  return !v.startsWith("{") && v.includes("-----BEGIN") ? v.replace(/\\n/g, "\n") : v;
}

/** Why the last app notification wasn't delivered, in plain words (shown by "Send me a test notification"). */
export let lastNativeFailure: string | null = null;
const fail = (why: string): SendResult => ((lastNativeFailure = why), "error");

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

// ── Android: Firebase Cloud Messaging ─────────────────────────────────────────────────────────

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let googleToken: { value: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = readSecret(process.env.FCM_SERVICE_ACCOUNT);
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error("incomplete");
    return { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    warnOnce("fcm-bad", "FCM_SERVICE_ACCOUNT is not valid service-account JSON: Android app notifications are off");
    return null;
  }
}

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (googleToken && googleToken.exp - 60 > now) return googleToken.value;
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud, iat: now, exp: now + 3600 }))}`;
  const jwt = `${unsigned}.${b64url(crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key))}`;
  const r = await fetch(aud, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Google sign-in failed: ${r.status} ${await r.text().catch(() => "")}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  googleToken = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

/** The FCM message: shown by Android itself, on the "orders" channel; the URL opens on tap. */
export function fcmMessage(token: string, msg: PushMessage) {
  const image = msg.image && /^https:\/\//.test(msg.image) ? msg.image : undefined;
  return {
    message: {
      token,
      notification: { title: msg.title, body: msg.body, ...(image ? { image } : {}) },
      data: { url: msg.url, ...(msg.tag ? { tag: msg.tag } : {}) },
      android: { priority: "HIGH", ttl: `${msg.requireInteraction ? 24 * 3600 : 3600}s`, notification: { channel_id: "orders", sound: "default", ...(msg.tag ? { tag: msg.tag } : {}) } },
    },
  };
}

export async function sendFcm(token: string, msg: PushMessage): Promise<SendResult> {
  const sa = serviceAccount();
  if (!sa) {
    warnOnce("fcm-missing", "FCM_SERVICE_ACCOUNT is not set: Android app notifications are off");
    return fail(process.env.FCM_SERVICE_ACCOUNT ? "the server's Firebase key (FCM_SERVICE_ACCOUNT) isn't valid" : "the server's Firebase key (FCM_SERVICE_ACCOUNT) isn't set");
  }
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await googleAccessToken(sa)}`, "Content-Type": "application/json" },
      body: JSON.stringify(fcmMessage(token, msg)),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return "ok";
    const text = await r.text().catch(() => "");
    if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) return "gone";
    if (r.status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text)) return "gone";
    if (r.status === 401) googleToken = null;
    console.error("FCM push failed", r.status, text.slice(0, 300));
    return fail(`Google answered ${r.status}: ${(/"message":\s*"([^"]+)"/.exec(text)?.[1] ?? text).slice(0, 160)}`);
  } catch (e) {
    console.error("FCM push error", e);
    return fail(`couldn't reach Google: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  }
}

// ── iPhone: Apple Push Notification service ───────────────────────────────────────────────────

let apnsJwt: { value: string; iat: number } | null = null;
let apnsSession: http2.ClientHttp2Session | null = null;

function apnsConfig() {
  const key = readSecret(process.env.APNS_KEY);
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  if (!key || !keyId || !teamId) return null;
  return { key, keyId, teamId, topic: process.env.APNS_BUNDLE_ID?.trim() || "me.numnum.app", host: process.env.APNS_HOST?.trim() || "https://api.push.apple.com" };
}

/** Apple's token: ES256-signed, reused for 50 minutes (Apple refuses tokens older than an hour). */
export function apnsToken(cfg: { key: string; keyId: string; teamId: string }, now = Math.floor(Date.now() / 1000)) {
  if (apnsJwt && now - apnsJwt.iat < 50 * 60) return apnsJwt.value;
  const unsigned = `${b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }))}.${b64url(JSON.stringify({ iss: cfg.teamId, iat: now }))}`;
  const sig = crypto.sign("SHA256", Buffer.from(unsigned), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  apnsJwt = { value: `${unsigned}.${b64url(sig)}`, iat: now };
  return apnsJwt.value;
}

export function apnsPayload(msg: PushMessage) {
  return { aps: { alert: { title: msg.title, body: msg.body }, sound: "default", ...(msg.tag ? { "thread-id": msg.tag } : {}) }, url: msg.url };
}

function session(host: string) {
  if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) return apnsSession;
  apnsSession = http2.connect(host);
  apnsSession.on("error", () => (apnsSession = null));
  apnsSession.on("goaway", () => (apnsSession = null));
  apnsSession.setTimeout(5 * 60_000, () => apnsSession?.close());
  return apnsSession;
}

/** Rejects after `ms`, so a connection that never opens can't hold a request forever. */
function withTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

export async function sendApns(token: string, msg: PushMessage): Promise<SendResult> {
  const cfg = apnsConfig();
  if (!cfg) {
    warnOnce("apns-missing", "APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID are not set: iPhone app notifications are off");
    const missing = ["APNS_KEY", "APNS_KEY_ID", "APNS_TEAM_ID"].filter((k) => !process.env[k]?.trim());
    return fail(missing.length ? `the server is missing ${missing.join(", ")}` : "the server's Apple key (APNS_KEY) isn't readable");
  }
  try {
    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken(cfg)}`,
      "apns-topic": cfg.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + (msg.requireInteraction ? 24 * 3600 : 3600)),
      ...(msg.tag ? { "apns-collapse-id": msg.tag.slice(0, 64) } : {}),
    };
    const { status, body } = await withTimeout(10_000, new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = session(cfg.host).request(headers);
      let status = 0;
      let body = "";
      req.setTimeout(8000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on("response", (h) => (status = Number(h[":status"])));
      req.on("data", (c) => (body += c));
      req.on("end", () => resolve({ status, body }));
      req.on("error", reject);
      req.on("close", () => status || reject(new Error("APNs request closed")));
      req.end(JSON.stringify(apnsPayload(msg)));
    }));
    if (status === 200) return "ok";
    const reason = (() => {
      try {
        return (JSON.parse(body) as { reason?: string }).reason ?? "";
      } catch {
        return "";
      }
    })();
    if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic") return "gone";
    if (reason === "ExpiredProviderToken") apnsJwt = null;
    console.error("APNs push failed", status, reason);
    return fail(`Apple answered ${status}${reason ? ` ${reason}` : ""}`);
  } catch (e) {
    apnsSession?.destroy();
    apnsSession = null;
    console.error("APNs push error", e);
    return fail(`couldn't reach Apple: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  }
}

export function sendNative(endpoint: string, msg: PushMessage): Promise<SendResult> {
  lastNativeFailure = null;
  const d = parseNativeEndpoint(endpoint);
  if (!d) return Promise.resolve("gone");
  return d.platform === "ios" ? sendApns(d.token, msg) : sendFcm(d.token, msg);
}
