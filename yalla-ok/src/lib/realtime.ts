"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

export type FeedEvent = { task_id: string; kind: "published" | "updated" | "removed" };
type Listener = (event: FeedEvent) => void;
type StatusListener = (connected: boolean) => void;

/** One shared Realtime subscription for the whole page. */
const listeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();
let channel: RealtimeChannel | null = null;
let connected = false;

function ensureChannel() {
  if (channel || !isSupabaseConfigured) return;
  channel = getBrowserClient()
    .channel("yalla-feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_events" }, (payload) => {
      const row = payload.new as FeedEvent;
      for (const l of listeners) l(row);
    })
    .subscribe((status) => {
      connected = status === "SUBSCRIBED";
      for (const l of statusListeners) l(connected);
    });
}

export function subscribeFeed(listener: Listener, onStatus?: StatusListener): () => void {
  listeners.add(listener);
  if (onStatus) {
    statusListeners.add(onStatus);
    onStatus(connected);
  }
  ensureChannel();
  return () => {
    listeners.delete(listener);
    if (onStatus) statusListeners.delete(onStatus);
    if (listeners.size === 0 && channel) {
      void getBrowserClient().removeChannel(channel);
      channel = null;
      connected = false;
    }
  };
}
