import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Film, MessageCircle, Receipt, Upload, Wallet } from "lucide-react";
import { getSettings } from "@/server/settings";
import { getCurrentUser } from "@/server/auth";
import { buttonClass } from "@/components/ui/button";
import { formatRate } from "@/lib/money";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("numnum for restaurants"), description: t("Turn food videos into delivery orders. No setup fees — pay a commission only on completed orders.") };
}

export default async function BusinessPage() {
  const t = await getT();
  const [s, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const steps = [
    { icon: Upload, title: "Import your menu", body: "Upload a CSV and drop in a ZIP of photos named by SKU. 150 items in minutes." },
    { icon: Film, title: "Post food reels", body: "Short vertical videos linked to dishes, with live prices and a one-tap Order button." },
    { icon: MessageCircle, title: "Receive orders instantly", body: "Orders arrive in your dashboard with a sound alert. Accept with a ready time, deliver, and collect cash on delivery." },
    { icon: Receipt, title: "One monthly invoice", body: t("Pay {rate} on completed orders only — never on views, clicks, rejected or canceled orders.", { rate: formatRate(s.defaultCommissionRateBps) }) },
    { icon: Wallet, title: "Settle via Whish", body: "Pay your monthly invoice with Whish Money and upload the receipt. Simple." },
    { icon: BadgeCheck, title: "Get verified", body: "Earn the verified badge by confirming your business identity." },
  ];
  return (
    <main className="min-h-dvh bg-cream">
      <header className="container-app flex items-center justify-between" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <Link href="/" className="text-brand-600" aria-label={t("numnum home")}>
          <Logo className="h-10" />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher compact />
          <Link href={user ? "/dashboard" : "/login?next=/dashboard"} className="text-sm font-semibold">
            {user ? t("Dashboard") : t("Log in")}
          </Link>
        </div>
      </header>
      <section className="container-app pb-10 pt-8 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-600">{t("For restaurants in Lebanon")}</p>
        <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight">{t("Turn food videos into delivery orders.")}</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">{t("No setup fees and no payment terminal. Customers discover your dishes in short videos, customize them, and order — paying you cash on delivery.")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/business/register" className={buttonClass("primary", "lg")}>
            {t("Register your restaurant")}
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{formatRate(s.defaultCommissionRateBps)} commission on completed orders · billed monthly</p>
      </section>
      <section className="container-app grid gap-3 pb-16 sm:grid-cols-2">
        {steps.map((st) => (
          <div key={st.title} className="card flex gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <st.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold">{t(st.title)}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t(st.body)}</p>
            </div>
          </div>
        ))}
        <p className="pt-2 text-center text-xs text-ink-muted sm:col-span-2">
          {t("Read the full")} <Link href="/commission-agreement" className="underline">{t("commission agreement")}</Link>.
        </p>
      </section>
    </main>
  );
}
