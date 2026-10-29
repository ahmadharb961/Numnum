import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./request";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return json({ error: "Invalid request", fieldErrors: Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message])) }, 400);
  const err = e as Error & { status?: number; fieldErrors?: Record<string, string> };
  if (err?.status && err.status < 500) return json({ error: err.message, fieldErrors: err.fieldErrors }, err.status);
  console.error(e);
  return json({ error: "Something went wrong. Please try again." }, 500);
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
