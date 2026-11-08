import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";

export const getSession = cache(async () => {
  if (!isSupabaseConfigured) return { supabase: null, user: null, profile: null } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null } as const;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (profile as Profile | null) ?? null } as const;
});

/** Signed-in user or a redirect to /login that comes back to `next`. */
export async function requireUser(next: string) {
  const session = await getSession();
  if (!session.supabase) redirect("/");
  if (!session.user || !session.profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase: session.supabase, user: session.user, profile: session.profile };
}

/** Admin only. Everyone else gets a plain 404 so the area isn't advertised. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session.supabase || !session.user || session.profile?.role !== "admin" || session.profile.status !== "active") {
    notFound();
  }
  return { supabase: session.supabase, user: session.user, profile: session.profile };
}

/** Only allow internal redirect targets. */
export function safeNext(next: unknown, fallback = "/"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
