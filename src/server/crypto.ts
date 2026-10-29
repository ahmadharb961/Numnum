import { createHash, createHmac, randomBytes } from "node:crypto";

export function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (min 16 chars)");
    return "dev-insecure-secret-do-not-use";
  }
  return s;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function hashIp(ip: string | null | undefined): string | null {
  return ip ? hmac(`ip:${ip}`).slice(0, 32) : null;
}
