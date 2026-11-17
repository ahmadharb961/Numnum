import type { Metadata } from "next";
import Link from "@/components/link";
import { checkResetToken } from "@/server/password-reset";
import { ResetPasswordForm } from "@/components/password-forms";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Choose a new password"), robots: { index: false } };
}

/** Opened from the "reset your password" email. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token = "" } = await searchParams;
  const check = await checkResetToken(token);
  if (!check.ok)
    return (
      <div className="pt-10 text-center" data-testid="reset-invalid">
        <div className="text-6xl">⏰</div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">{check.reason === "expired" ? t("This link has expired") : t("This link isn't valid anymore")}</h1>
        <p className="mx-auto mt-2 max-w-xs text-ink-muted">{t("Reset links work for 1 hour and only once. Ask for a new one.")}</p>
        <Link href="/forgot-password" className={buttonClass("primary", "lg") + " mt-6 w-full"}>
          {t("Send a new link")}
        </Link>
      </div>
    );
  return (
    <div className="pt-6">
      <h1 className="text-center text-3xl font-black tracking-tight">{t("Choose a new password")}</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-[15px] text-ink-soft">{t("You'll be logged out on your other devices.")}</p>
      <div className="mt-6">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
