import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./request";
import { getLocale, tFor } from "@/i18n/server";
import { formatKm } from "@/lib/geo";

type Texts = Record<string, { k: string; v?: Record<string, string | number> }>;

/**
 * Redirect to a path on this site. The Location stays relative: behind a proxy (Hostinger) the
 * request URL is the server's internal address (e.g. http://0.0.0.0:3000), not the public domain.
 */
export function seeOther(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) path = "/";
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** API error in the visitor's language: known messages from the dictionary, templated ones via `texts`. */
export async function errorResponse(e: unknown) {
  const locale = await getLocale().catch(() => "en" as const);
  const t = tFor(locale);
  // Distances travel as numbers (km) and are formatted in the visitor's units.
  const fmt = (x: { k: string; v?: Record<string, string | number> }) =>
    t(x.k, Object.fromEntries(Object.entries(x.v ?? {}).map(([k, v]) => [k, typeof v === "number" && (k === "km" || k === "max") ? formatKm(v, locale) : v])));
  if (e instanceof ZodError) return json({ error: t("Invalid request"), fieldErrors: Object.fromEntries(e.issues.map((i) => [i.path.join("."), t(i.message)])) }, 400);
  const err = e as Error & { status?: number; fieldErrors?: Record<string, string>; texts?: Texts };
  if (err?.status && err.status < 500) {
    const texts = err.texts ?? {};
    const fieldErrors = err.fieldErrors && Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, texts[k] ? fmt(texts[k]) : t(v)]));
    return json({ error: texts._ ? fmt(texts._) : t(err.message), fieldErrors }, err.status);
  }
  console.error(e);
  return json({ error: t("Something went wrong. Please try again.") }, 500);
}

export async function limit(bucket: string, max: number, windowMs: number) {
  const ip = (await clientIp()) ?? "unknown";
  const r = rateLimit(`${bucket}:${ip}`, max, windowMs);
  if (!r.ok) {
    const e = new Error("Too many requests. Please slow down.") as Error & { status: number };
    e.status = 429;
    throw e;
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) {
    const e = new Error("Request too large") as Error & { status: number };
    e.status = 413;
    throw e;
  }
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    const e = new Error("Invalid JSON") as Error & { status: number };
    e.status = 400;
    throw e;
  }
}
