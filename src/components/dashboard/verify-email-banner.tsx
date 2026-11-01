"use client";

import { useTransition } from "react";
import { MailCheck } from "lucide-react";
import { resendVerifyEmailAction } from "@/actions/restaurant";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";

/** Shown until the owner confirms their email (the welcome email follows the confirmation). */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-100" data-testid="verify-email-banner">
      <MailCheck className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">{t("Confirm your email: we sent a link to {email}.", { email })}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendVerifyEmailAction();
            toast(t(r.ok ? (r.message ?? "Sent") : (r.error ?? "Something went wrong")), r.ok ? "success" : "error");
          })
        }
        className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
      >
        {t("Resend")}
      </button>
    </div>
  );
}
