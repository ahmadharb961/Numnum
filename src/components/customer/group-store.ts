"use client";

import { useSyncExternalStore } from "react";
import type { GroupState } from "@/server/group-carts";

// The group order this browser is part of (kept on the phone). While in a group, the cart is this
// person's share of it: what they add is sent to the group, and the host checks out for everyone.

export type GroupCtx = {
  code: string;
  restaurantId: string;
  isHost: boolean;
  /** "checkout": the host is placing the order (the cart holds everyone's items; nothing is synced). */
  mode: "open" | "checkout";
};

const KEY = "nn_group_v1";
const listeners = new Set<() => void>();
let current: GroupCtx | null | undefined;

export function getGroup(): GroupCtx | null {
  if (typeof window === "undefined") return null;
  if (current === undefined) {
    try {
      current = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      current = null;
    }
  }
  return current ?? null;
}

export function setGroup(g: GroupCtx | null) {
  current = g;
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = undefined;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGroup() {
  return useSyncExternalStore(subscribe, getGroup, () => null);
}

export class GroupApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function groupApi<T = GroupState>(code: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/group/${encodeURIComponent(code)}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const fe = data?.fieldErrors ? (Object.values(data.fieldErrors)[0] as string | undefined) : undefined;
    throw new GroupApiError(fe || data?.error || "Something went wrong. Please try again.", r.status);
  }
  return data as T;
}

/** A cart line as the group stores it (the browser's own key is left out). */
export function toGroupLines<T extends { key: string }>(lines: T[]) {
  return lines.map(({ key: _k, ...l }) => l);
}

// My items are sent shortly after each change (one request for a burst of taps).
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: unknown[] | null = null;
export function syncMyLines(restaurantId: string | null, lines: { key: string }[]) {
  const g = getGroup();
  if (!g || g.mode !== "open") return;
  if (restaurantId && restaurantId !== g.restaurantId) return;
  pending = toGroupLines(lines);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const send = pending;
    pending = null;
    groupApi(g.code, { action: "lines", lines: send })
      .then((s) => window.dispatchEvent(new CustomEvent("nn:group", { detail: s })))
      .catch((e: GroupApiError) => window.dispatchEvent(new CustomEvent("nn:group-error", { detail: e.message })));
  }, 450);
}
