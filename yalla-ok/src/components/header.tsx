import Link from "next/link";
import { Plus, UserRound, Shield } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { publicStorageUrl } from "@/lib/env";
import { initials } from "@/lib/format";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { LiveCount } from "@/components/live-count";

async function liveCount(): Promise<number> {
  const { supabase } = await getSession();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  return count ?? 0;
}

export async function Header() {
  const [{ profile }, settings, count] = await Promise.all([getSession(), getSettings(), liveCount()]);
  const avatar = profile?.avatar_url ? publicStorageUrl("avatars", profile.avatar_url) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-ink/5 bg-white/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 sm:h-[72px] sm:px-6">
        <Logo name={settings.brand_name} />

        <nav className="ml-6 hidden h-full items-stretch gap-1 md:flex" aria-label="Main">
          <NavLink href="/" exact>Live Tasks</NavLink>
          <NavLink href="/post">Post a Task</NavLink>
          <NavLink href="/my">My Tasks</NavLink>
          {profile?.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LiveCount initial={count} />
          {profile?.role === "admin" && (
            <Link href="/admin" className="rounded-full p-2 text-ink-soft hover:bg-lavender md:hidden" aria-label="Admin">
              <Shield className="h-5 w-5" />
            </Link>
          )}
          <Link
            href="/post"
            className="hidden items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-fab transition hover:bg-brand-600 md:inline-flex"
          >
            <Plus className="h-4 w-4" aria-hidden /> Post a Task
          </Link>
          {profile ? (
            <Link
              href="/profile"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-2 ring-white transition hover:ring-brand-200"
              aria-label="Your profile"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(profile.display_name) || <UserRound className="h-5 w-5" />
              )}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-lavender hover:text-ink"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
