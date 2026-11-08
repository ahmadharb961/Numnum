import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Settings } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  brand_name: "Yalla Ok",
  hero_title: "Post it. Get it done.",
  hero_subtitle: "Live tasks people will pay to have done. Tap one and chat on WhatsApp.",
  posting_fee_cents: 100,
  currency: "USD",
  free_posts: 3,
  whish_account_name: "Yalla Ok",
  whish_number: "",
  payment_instructions: "",
  allowed_durations: [30, 60, 180, 360, 720, 1440],
  auto_publish: true,
  max_tasks_per_hour: 5,
  max_tasks_per_day: 15,
  blocked_words: [],
  updated_at: new Date(0).toISOString(),
};

export const getSettings = cache(async (): Promise<Settings> => {
  if (!isSupabaseConfigured) return DEFAULT_SETTINGS;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return (data as Settings | null) ?? DEFAULT_SETTINGS;
});
