import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Film, MessageCircle, Receipt, Upload, Wallet } from "lucide-react";
import { getSettings } from "@/server/settings";
import { getCurrentUser } from "@/server/auth";
import { buttonClass } from "@/components/ui/button";
import { formatRate } from "@/lib/money";

export const metadata: Metadata = { title: "numnum for restaurants", description: "Turn food videos into WhatsApp orders. No setup fees — pay a commission only on order requests you acknowledge." };

export default async function BusinessPage() {
  const [s, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const steps = [
    { icon: Upload, title: "Import your menu", body: "Upload a CSV and drop in a ZIP of photos named by SKU. 150 items in minutes." },
    { icon: Film, title: "Post food reels", body: "Short vertical videos linked to dishes, with live prices and a one-tap Order button." },
    { icon: MessageCircle, title: "Get WhatsApp orders", body: "Customers send a complete, itemized order straight to your WhatsApp. You confirm, collect payment and deliver." },
    { icon: Receipt, title: "One monthly invoice", body: `Pay ${formatRate(s.defaultCommissionRateBps)} on order requests you acknowledge — never on views or clicks.` },
    { icon: Wallet, title: "Settle via Whish", body: "Pay your monthly invoice with Whish Money and upload the receipt. Simple." },
    { icon: BadgeCheck, title: "Get verified", body: "Earn the verified badge by confirming your business identity." },
  ];
  return (
    <main className="min-h-dvh bg-cream">
      <header className="container-app flex h-16 items-center justify-between" style={{ paddingTop: "var(--safe-top)" }}>
        <Link href="/" className="text-2xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
        <Link href={user ? "/dashboard" : "/login?next=/dashboard"} className="text-sm font-semibold">
          {user ? "Dashboard" : "Log in"}
        </Link>
      </header>
      <section className="container-app pb-10 pt-8 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-600">For restaurants in Lebanon</p>
        <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight">Turn food videos into WhatsApp orders.</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">No setup fees, no delivery fleet, no payment terminal. Customers discover your dishes, customize them, and send the order to your WhatsApp.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/business/register" className={buttonClass("primary", "lg")}>
            Register your restaurant
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{formatRate(s.defaultCommissionRateBps)} commission on acknowledged order requests · billed monthly</p>
      </section>
      <section className="container-app grid gap-3 pb-16 sm:grid-cols-2">
        {steps.map((st) => (
          <div key={st.title} className="card flex gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <st.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold">{st.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{st.body}</p>
            </div>
          </div>
        ))}
        <p className="pt-2 text-center text-xs text-ink-muted sm:col-span-2">
          Read the full <Link href="/commission-agreement" className="underline">commission agreement</Link>.
        </p>
      </section>
    </main>
  );
}
