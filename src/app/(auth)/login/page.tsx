import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Store, User, UtensilsCrossed } from "lucide-react";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

function LinkCard({ href, icon: Icon, title, action }: { href: string; icon: typeof User; title: string; action: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(22,18,15,0.05),0_6px_20px_rgba(22,18,15,0.05)] transition hover:shadow-md active:scale-[0.99]">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block font-semibold text-brand-600">{action}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
    </Link>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/illustrations/login-hero.webp" alt="A chef cooking and a customer enjoying her meal" className="-mx-4 w-[calc(100%+2rem)] max-w-none lg:hidden" />
      <div className="mt-2 text-center lg:mt-0">
        <h1 className="relative inline-block text-[2.4rem] font-black leading-tight tracking-tight">
          Welcome back
          <svg viewBox="0 0 24 24" className="absolute -right-7 top-1 h-6 w-6 text-brand-500" aria-hidden="true">
            <path d="M6 14 L14 6 M9 19 L19 15" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
        </h1>
        <p className="mx-auto mt-1 max-w-xs text-[15px] font-medium text-ink-soft">Log in to your restaurant dashboard or customer account.</p>
      </div>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
      <div className="my-6 flex items-center gap-4 text-sm text-ink-muted">
        <span className="h-px flex-1 bg-black/10" />
        or
        <span className="h-px flex-1 bg-black/10" />
      </div>
      <div className="space-y-3">
        <LinkCard href={`/account/register${q}`} icon={User} title="New here?" action="Create a customer account" />
        <LinkCard href="/business/register" icon={Store} title="Own a restaurant?" action="Register your restaurant" />
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-ink-muted">
        <UtensilsCrossed className="h-4 w-4 shrink-0" />
        <span>
          Browsing is open to everyone — an account is only <b className="font-semibold text-ink-soft">needed to order.</b>
        </span>
      </p>
    </div>
  );
}
