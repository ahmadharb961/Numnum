import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Receipt, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { Checkout } from "@/components/customer/checkout";
import { PageHeader } from "@/components/customer/page-header";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Checkout"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

/** Browsing is open to everyone; placing an order needs an account (location, contact, history). */
export default async function CheckoutPage() {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="pb-nav">
        <PageHeader title="Checkout" />
        <div className="container-app pt-8 text-center">
          <div className="text-5xl">🛵</div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">{t("Log in to place your order")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("Your cart is saved. An account lets the restaurant reach you and deliver to your exact location.")}</p>
          <ul className="mx-auto mt-6 max-w-sm space-y-3 text-start text-sm">
            <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-500" /> {t("Saved addresses pinned on the map — checkout in seconds")}</li>
            <li className="flex gap-3"><Receipt className="h-5 w-5 shrink-0 text-brand-500" /> {t("Live order tracking and order history")}</li>
            <li className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-brand-500" /> {t("Cash on delivery — no card needed")}</li>
          </ul>
          <div className="mx-auto mt-8 grid max-w-sm gap-3">
            <Link href="/account/register?next=/checkout" className={buttonClass("primary", "lg")}>
              {t("Create an account")}
            </Link>
            <Link href="/login?next=/checkout" className={buttonClass("outline", "lg")}>
              {t("I already have an account")}
            </Link>
          </div>
        </div>
      </main>
    );
  }
  return <Checkout />;
}
