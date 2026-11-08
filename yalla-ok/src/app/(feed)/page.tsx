import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { isSupabaseConfigured } from "@/lib/env";
import { PUBLIC_TASK_COLUMNS, type PublicTask } from "@/lib/types";
import { LiveFeed } from "@/components/live-feed";
import { SetupNotice } from "@/components/setup-notice";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const [{ supabase }, settings] = await Promise.all([getSession(), getSettings()]);
  const { data, error } = await supabase!
    .from("tasks")
    .select(PUBLIC_TASK_COLUMNS)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6 sm:space-y-10">
      <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-6 text-white sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-sun/30 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl">
          <h1 className="text-[1.9rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">{settings.hero_title}</h1>
          <p className="mt-2 text-[15px] text-white/85 sm:mt-4 sm:text-lg">{settings.hero_subtitle}</p>
          <p className="mt-5 hidden text-sm font-medium text-white/70 sm:block">
            Browse freely · Chat on WhatsApp · First {settings.free_posts} posts free
          </p>
        </div>
      </section>

      {error ? (
        <Notice tone="error" title="Couldn’t load tasks">
          Please refresh the page in a moment.
        </Notice>
      ) : (
        <LiveFeed initialTasks={(data ?? []) as PublicTask[]} />
      )}
    </div>
  );
}
