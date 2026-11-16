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
    // One compact line, so the page itself stays in view.
    <div className="flex items-center gap-2.5 rounded-2xl bg-sky-50 py-2 pe-2 ps-3 text-sky-900 ring-1 ring-sky-100" data-testid="verify-email-banner">
      <MailCheck className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-bold">{t("Confirm your email")}</span>
        <span className="block truncate text-xs text-sky-800/80" title={email}>
          {t("Link sent to {email}", { email })}
        </span>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendVerifyEmailAction();
            toast(t(r.ok ? (r.message ?? "Sent") : (r.error ?? "Something went wrong")), r.ok ? "success" : "error");
          })
        }
        className="shrink-0 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-60"
      >
        {t("Resend")}
      </button>
    </div>
  );
}
