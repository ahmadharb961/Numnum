import crypto from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: { generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), setVapidDetails: () => {}, sendNotification: async () => {} },
}));

import { prisma } from "@/server/db";
import { pushToDevices } from "@/server/push";
import * as native from "@/server/native-push";
import { apnsPayload, apnsToken, fcmMessage, nativeEndpoint, normalizePem, parseNativeEndpoint, readSecret, sendApns, sendFcm, sendNative } from "@/server/native-push";
import { resetDb } from "./helpers";

const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const p8 = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const serviceAccount = { project_id: "numnum-test", client_email: "push@numnum-test.iam.gserviceaccount.com", private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const msg = { title: "New order NN-1", body: "2 items · $12.00", url: "/dashboard/orders?ref=NN-1", tag: "order-NN-1", image: "https://numnum.me/x.jpg" };
const APNS_TOKEN = "a".repeat(64);

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("device addresses and secrets", () => {
  it("round-trips app device addresses", () => {
    expect(parseNativeEndpoint(nativeEndpoint("ios", APNS_TOKEN))).toEqual({ platform: "ios", token: APNS_TOKEN });
    expect(parseNativeEndpoint(nativeEndpoint("android", "fcm:tok_en-1"))).toEqual({ platform: "android", token: "fcm:tok_en-1" });
    expect(parseNativeEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBeNull();
  });

  it("reads keys pasted as is, with \\n, or base64", () => {
    expect(readSecret(p8)).toBe(p8.trim());
    expect(readSecret(p8.trim().replace(/\n/g, "\\n"))).toBe(p8.trim());
    expect(readSecret(Buffer.from(p8).toString("base64"))).toBe(p8.trim());
    const json = JSON.stringify(serviceAccount);
    expect(JSON.parse(readSecret(Buffer.from(json).toString("base64"))!)).toEqual(serviceAccount);
    expect(readSecret("  ")).toBeNull();
  });
});

describe("keys pasted into a hosting panel", () => {
  const body = p8.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const pasted = {
    "as downloaded": p8,
    "line breaks turned into spaces": p8.trim().replace(/\n/g, " "),
    "line breaks removed": p8.trim().replace(/\n/g, ""),
    "literal \\n": p8.trim().replace(/\n/g, "\\n"),
    "Windows line breaks": p8.replace(/\n/g, "\r\n"),
    "only the middle part": body,
    base64: Buffer.from(p8).toString("base64"),
  };
  for (const [how, value] of Object.entries(pasted))
    it(`signs with a key pasted ${how}`, () => {
      const key = normalizePem(readSecret(value)!);
      const sig = crypto.sign("SHA256", Buffer.from("x"), { key, dsaEncoding: "ieee-p1363" });
      expect(crypto.verify("SHA256", Buffer.from("x"), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    });

  it("the Firebase key inside the JSON is repaired too", () => {
    const flat = { ...serviceAccount, private_key: serviceAccount.private_key.trim().replace(/\n/g, " ") };
    const key = normalizePem(flat.private_key);
    expect(() => crypto.sign("RSA-SHA256", Buffer.from("x"), key)).not.toThrow();
  });
});

describe("messages", () => {
  it("Android: shown on the orders channel with the image; the link travels in data", () => {
    const m = fcmMessage("tok", msg).message;
    expect(m.notification).toEqual({ title: msg.title, body: msg.body, image: msg.image });
    expect(m.data).toEqual({ url: msg.url, tag: msg.tag });
    expect(m.android.priority).toBe("HIGH");
    expect(m.android.notification.channel_id).toBe("orders");
    expect(fcmMessage("tok", { ...msg, image: "http://insecure/x.jpg" }).message.notification).not.toHaveProperty("image");
  });

  it("iPhone: alert with sound, grouped by tag, link at the top level", () => {
    expect(apnsPayload(msg)).toEqual({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": msg.tag }, url: msg.url });
  });

  it("signs Apple's token with ES256 (key id + team id)", () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = apnsToken({ key: p8, keyId: "KEY1234567", teamId: "D98H89PFMJ" }, now);
    const [h, p, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(decode(p)).toEqual({ iss: "D98H89PFMJ", iat: now });
    expect(crypto.verify("SHA256", Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
    expect(apnsToken({ key: p8, keyId: "KEY1234567", teamId: "D98H89PFMJ" }, now + 60)).toBe(jwt); // reused, not re-signed
  });
});

describe("Android sending (Firebase)", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let sendStatus = 200;
  let sendBody = "{}";
  beforeEach(() => {
    calls.length = 0;
    sendStatus = 200;
    sendBody = "{}";
    process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(serviceAccount);
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
      return new Response(sendBody, { status: sendStatus });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FCM_SERVICE_ACCOUNT;
  });

  it("signs in with the service account and sends to the project", async () => {
    expect(await sendFcm("fcm-token", msg)).toBe("ok");
    const auth = calls.find((c) => c.url.includes("oauth2"))!;
    const assertion = new URLSearchParams(String(auth.init.body)).get("assertion")!;
    const [h, p, s] = assertion.split(".");
    expect(decode(p)).toMatchObject({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging" });
    expect(crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), rsa.publicKey, Buffer.from(s, "base64url"))).toBe(true);
    const send = calls.find((c) => c.url.includes("fcm.googleapis.com"))!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/numnum-test/messages:send");
    expect((send.init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.test");
    expect(JSON.parse(String(send.init.body)).message.token).toBe("fcm-token");
  });

  it("an uninstalled app is 'gone'; other failures are retried later", async () => {
    sendStatus = 404;
    sendBody = JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } });
    expect(await sendFcm("old-token", msg)).toBe("gone");
    sendStatus = 503;
    sendBody = "unavailable";
    expect(await sendFcm("fcm-token", msg)).toBe("error");
  });

  it("without settings nothing is sent and the device is kept", async () => {
    delete process.env.FCM_SERVICE_ACCOUNT;
    expect(await sendFcm("fcm-token", msg)).toBe("error");
    expect(calls).toHaveLength(0);
  });
});

describe("iPhone sending (Apple)", () => {
  let server: http2.Http2Server;
  const seen: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
  let reply: { status: number; body?: string } = { status: 200 };
  beforeAll(async () => {
    server = http2.createServer();
    server.on("stream", (stream, headers) => {
      let body = "";
      stream.on("data", (c) => (body += c));
      stream.on("end", () => {
        seen.push({ headers, body });
        stream.respond({ ":status": reply.status });
        stream.end(reply.body ?? "");
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.APNS_HOST = `http://localhost:${(server.address() as AddressInfo).port}`;
    process.env.APNS_KEY = p8;
    process.env.APNS_KEY_ID = "KEY1234567";
    process.env.APNS_TEAM_ID = "D98H89PFMJ";
  });
  afterAll(() => {
    server.close();
    for (const k of ["APNS_HOST", "APNS_KEY", "APNS_KEY_ID", "APNS_TEAM_ID"]) delete process.env[k];
  });
  beforeEach(() => {
    seen.length = 0;
    reply = { status: 200 };
  });

  it("sends an alert to the device for the numnum app", async () => {
    expect(await sendApns(APNS_TOKEN, msg)).toBe("ok");
    const { headers, body } = seen[0];
    expect(headers[":path"]).toBe(`/3/device/${APNS_TOKEN}`);
    expect(headers["apns-topic"]).toBe("me.numnum.app");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-collapse-id"]).toBe(msg.tag);
    expect(String(headers.authorization)).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(body)).toEqual(apnsPayload(msg));
  });

  it("explains failures in plain words (shown by 'Send me a test notification')", async () => {
    reply = { status: 403, body: JSON.stringify({ reason: "InvalidProviderToken" }) };
    expect(await sendNative(nativeEndpoint("ios", APNS_TOKEN), msg)).toBe("error");
    expect(native.lastNativeFailure).toBe("Apple answered 403 InvalidProviderToken");
    reply = { status: 200 };
    expect(await sendNative(nativeEndpoint("ios", APNS_TOKEN), msg)).toBe("ok");
    expect(native.lastNativeFailure).toBeNull();
    const key = process.env.APNS_KEY_ID;
    delete process.env.APNS_KEY_ID;
    expect(await sendNative(nativeEndpoint("ios", APNS_TOKEN), msg)).toBe("error");
    expect(native.lastNativeFailure).toBe("the server is missing APNS_KEY_ID");
    process.env.APNS_KEY_ID = key;
    const good = process.env.APNS_KEY;
    process.env.APNS_KEY = "not a key at all";
    expect(await sendNative(nativeEndpoint("ios", APNS_TOKEN), msg)).toBe("error");
    expect(native.lastNativeFailure).toMatch(/APNS_KEY\) can't be read/);
    process.env.APNS_KEY = good;
  });

  it("delivers with the key exactly as a hosting panel mangles it (line breaks turned into spaces)", async () => {
    const good = process.env.APNS_KEY;
    process.env.APNS_KEY = p8.trim().replace(/\n/g, " ");
    expect(await sendApns(APNS_TOKEN, msg)).toBe("ok");
    const auth = String(seen.at(-1)!.headers.authorization).slice(7);
    const [h, p, sig] = auth.split(".");
    expect(crypto.verify("SHA256", Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    process.env.APNS_KEY = good;
  });

  it("an uninstalled app is 'gone'", async () => {
    reply = { status: 410, body: JSON.stringify({ reason: "Unregistered" }) };
    expect(await sendApns(APNS_TOKEN, msg)).toBe("gone");
    reply = { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
    expect(await sendApns(APNS_TOKEN, msg)).toBe("gone");
    reply = { status: 429, body: JSON.stringify({ reason: "TooManyRequests" }) };
    expect(await sendApns(APNS_TOKEN, msg)).toBe("error");
  });

  it("app devices go through the same sending as browsers; uninstalled ones are forgotten", async () => {
    await resetDb();
    await prisma.pushSubscription.createMany({
      data: [
        { endpoint: nativeEndpoint("ios", APNS_TOKEN), p256dh: "-", auth: "-" },
        { endpoint: nativeEndpoint("ios", "b".repeat(64)), p256dh: "-", auth: "-" },
      ],
    });
    let n = 0;
    server.removeAllListeners("stream");
    server.on("stream", (stream) => {
      stream.on("data", () => {});
      stream.on("end", () => {
        // first device delivered, second one was uninstalled
        const gone = n++ > 0;
        stream.respond({ ":status": gone ? 410 : 200 });
        stream.end(gone ? JSON.stringify({ reason: "Unregistered" }) : "");
      });
    });
    expect(await pushToDevices({}, msg)).toBe(1);
    expect((await prisma.pushSubscription.findMany()).map((s) => s.endpoint)).toHaveLength(1);
  });
});
