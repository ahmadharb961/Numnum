import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmail } from "@/server/restaurant-emails";
import { getCurrentUser } from "@/server/auth";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

/** Opened from the confirmation email. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token = "" } = await searchParams;
  const [r, user] = await Promise.all([confirmEmail(token), getCurrentUser()]);
  const loggedIn = !!user && r.ok && user.id === r.userId;
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
      <div className="max-w-sm" data-testid="verify-email">
        <div className="text-6xl">{r.ok ? "🎉" : "⏰"}</div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">
          {r.ok ? (r.already ? t("Your email is already confirmed") : t("Email confirmed!")) : r.reason === "expired" ? t("This link has expired") : t("This link isn't valid")}
        </h1>
        <p className="mt-2 text-ink-muted">
          {r.ok ? t("We sent you a welcome email with everything you need to start.") : t("Log in to your dashboard and tap “Resend” to get a new confirmation email.")}
        </p>
        <Link href={loggedIn || !r.ok ? "/dashboard" : "/login?next=/dashboard"} className={buttonClass("primary", "lg") + " mt-6 w-full"}>
          {t("Open my dashboard")}
        </Link>
      </div>
    </main>
  );
}
