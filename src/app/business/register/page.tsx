import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { RestaurantRegisterForm } from "@/components/auth-forms";
import { BackButton } from "@/components/back-button";
import { Logo } from "@/components/logo";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Register your restaurant"), robots: { index: false } };
}

export default async function RegisterRestaurantPage() {
  const t = await getT();
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex items-center gap-1" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton fallback="/business" />
        <Link href="/business" className="text-brand-600" aria-label={t("numnum for restaurants")}>
          <Logo className="h-10" />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        <h1 className="text-3xl font-black tracking-tight">{t("Register your restaurant")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("Takes about a minute. Next you'll import your menu and photos.")}</p>
        <div className="card mt-6 p-5">
          <RestaurantRegisterForm loggedInEmail={user?.email} />
        </div>
        {!user && (
          <p className="mt-4 text-center text-sm">
            {t("Already registered?")}{" "}
            <Link href="/login?next=/dashboard" className="font-semibold text-brand-600">
              {t("Log in")}
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
