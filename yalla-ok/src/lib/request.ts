import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** A salted hash, so reports can be rate-limited without storing IPs. */
export async function visitorKey(): Promise<string> {
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "yalla-ok";
  return "ip:" + createHash("sha256").update(salt + "|" + (await clientIp())).digest("hex").slice(0, 32);
}
