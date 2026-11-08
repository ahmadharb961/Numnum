import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A task on Yalla Ok";

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let task: { headline: string; description: string; reward_cents: number; location: string } | null = null;
  if (isSupabaseConfigured && /^[0-9a-f-]{36}$/i.test(id)) {
    // Anonymous client: only live tasks are readable, exactly what a link preview should show.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("tasks")
      .select("headline, description, reward_cents, location")
      .eq("id", id)
      .maybeSingle();
    task = data;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #8125e8 0%, #5b16a6 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#ffd43b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#8125e8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>Yalla Ok</div>
        </div>

        {task ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 120, fontWeight: 900, color: "#ffd43b", lineHeight: 1 }}>{formatMoney(task.reward_cents)}</div>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{task.headline}</div>
            <div style={{ fontSize: 34, opacity: 0.85 }}>{task.description}</div>
          </div>
        ) : (
          <div style={{ fontSize: 72, fontWeight: 800 }}>Post it. Get it done.</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, opacity: 0.9 }}>
          <div>{task ? task.location : "Live tasks near you"}</div>
          <div>Contact on WhatsApp</div>
        </div>
      </div>
    ),
    size,
  );
}
