import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/password-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Forgot your password?"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <div className="pt-6">
      <h1 className="text-center text-3xl font-black tracking-tight">{t("Forgot your password?")}</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-[15px] text-ink-soft">{t("Enter the email of your account and we'll send you a link to choose a new one.")}</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
