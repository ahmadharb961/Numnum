import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="text-3xl font-black tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-muted">Log in to your restaurant dashboard or customer account.</p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          New here?{" "}
          <Link href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600">
            Create a customer account
          </Link>
        </p>
        <p>
          Own a restaurant?{" "}
          <Link href="/business/register" className="font-semibold text-brand-600">
            Register your restaurant
          </Link>
        </p>
        <p className="pt-2 text-xs text-ink-muted">Browsing is open to everyone — an account is only needed to order.</p>
      </div>
    </div>
  );
}
