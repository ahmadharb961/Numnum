"use client";

import { useActionState, useState } from "react";
import Link from "@/components/link";
import { ArrowRight, Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
import { changePasswordAction, forgotPasswordAction, resetPasswordAction } from "@/actions/password";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

/** A password input with a show/hide eye. */
function PasswordInput({ id, name, autoComplete, placeholder }: { id: string; name: string; autoComplete: string; placeholder?: string }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <Lock className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
      <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={8} placeholder={placeholder ? t(placeholder) : undefined} className="input h-14 rounded-2xl ps-12 pe-12" />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-black/5" aria-label={show ? t("Hide password") : t("Show password")}>
        {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
      </button>
    </span>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, undefined);
  const [email, setEmail] = useState("");
  if (state?.ok)
    return (
      <div className="text-center" data-testid="forgot-sent">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck className="h-8 w-8" />
        </span>
        <p className="mx-auto mt-4 max-w-sm text-[15px] text-ink-soft">{t(state.message ?? "")}</p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand-600">
          {t("Back to log in")}
        </Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{t(state.error)}</Alert>}
      <Field label="Email" error={state?.fieldErrors?.email} htmlFor="email">
        <span className="relative block">
          <Mail className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder={t("Enter your email")} className="input h-14 rounded-2xl ps-12" />
        </span>
      </Field>
      <Button type="submit" size="lg" block loading={pending} className="h-14 rounded-2xl text-base">
        {t("Send me a link")} <ArrowRight className="rtl:-scale-x-100 h-5 w-5" />
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <Alert tone="red">
          {t(state.error)}{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            {t("Send a new link")}
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" error={fe.password} hint="At least 8 characters" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" error={fe.confirm} htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" block loading={pending} className="h-14 rounded-2xl text-base">
        {t("Save new password")}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    // Cleared after a successful change (a new key remounts the form).
    <form key={state?.ok ? "done" : "form"} action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{t(state.message ?? "")}</Alert>}
      {state?.error && <Alert tone="red">{t(state.error)}</Alert>}
      <Field label="Current password" error={fe.current} htmlFor="current">
        <PasswordInput id="current" name="current" autoComplete="current-password" />
      </Field>
      <Field label="New password" error={fe.password} hint="At least 8 characters" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" error={fe.confirm} htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" block loading={pending} className="h-14 rounded-2xl text-base">
        {t("Change password")}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {t("Forgot it?")}{" "}
        <Link href="/forgot-password" className="font-semibold text-brand-600">
          {t("Reset it by email")}
        </Link>
      </p>
    </form>
  );
}
