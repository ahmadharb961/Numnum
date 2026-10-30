import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { RestaurantRegisterForm } from "@/components/auth-forms";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = { title: "Register your restaurant", robots: { index: false } };

export default async function RegisterRestaurantPage() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex h-16 items-center gap-1" style={{ paddingTop: "var(--safe-top)" }}>
        <BackButton fallback="/business" />
        <Link href="/business" className="text-2xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        <h1 className="text-3xl font-black tracking-tight">Register your restaurant</h1>
        <p className="mt-1 text-sm text-ink-muted">Takes about a minute. Next you&apos;ll import your menu and photos.</p>
        <div className="card mt-6 p-5">
          <RestaurantRegisterForm loggedInEmail={user?.email} />
        </div>
        {!user && (
          <p className="mt-4 text-center text-sm">
            Already registered?{" "}
            <Link href="/login?next=/dashboard" className="font-semibold text-brand-600">
              Log in
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
