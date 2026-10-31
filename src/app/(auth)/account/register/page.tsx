import type { Metadata } from "next";
import Link from "next/link";
import { CustomerRegisterForm } from "@/components/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create account"), robots: { index: false } };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getT();
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="text-3xl font-black tracking-tight">{t("Create your account")}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("Order with cash on delivery, save your addresses, track orders and rate what you ate.")}</p>
      <div className="mt-6">
        <CustomerRegisterForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm">
        {t("Already have an account?")}{" "}
        <Link href="/login" className="font-semibold text-brand-600">
          {t("Log in")}
        </Link>
      </p>
    </div>
  );
}
