import "server-only";
import { cookies, headers } from "next/headers";
import { hashIp } from "./crypto";

export const DEVICE_COOKIE = "nn_did";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function ipHash(): Promise<string | null> {
  return hashIp(await clientIp());
}

/** Anonymous device id set by middleware. Used for de-duplication, never for tracking across sites. */
export async function deviceId(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(DEVICE_COOKIE)?.value;
  return v && /^[a-zA-Z0-9_-]{16,64}$/.test(v) ? v : null;
}
