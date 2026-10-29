"use client";

type Refs = { reelId?: string; menuItemId?: string; restaurantId?: string };

/** Fire-and-forget engagement analytics. Uses sendBeacon so it survives navigation. */
export function track(type: string, refs: Refs = {}) {
  try {
    const body = JSON.stringify({ type, ...refs });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {}
}

export async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || "Something went wrong") as Error & { fieldErrors?: Record<string, string>; status?: number };
    err.fieldErrors = json.fieldErrors;
    err.status = res.status;
    throw err;
  }
  return json as T;
}
