import type { MetadataRoute } from "next";
import { SITE_URL, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 }];
  if (!isSupabaseConfigured) return entries;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, published_at")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .limit(1000);
  for (const t of data ?? []) {
    entries.push({ url: `${SITE_URL}/t/${t.id}`, lastModified: t.published_at ?? undefined, changeFrequency: "hourly" });
  }
  return entries;
}
