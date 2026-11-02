"use client";

import { useActionState } from "react";
import { deleteAccountAction, requestClosureAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export function DeleteAccountForm({ email, blockedByOrder }: { email: string; blockedByOrder: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, undefined);
  return (
    <form action={action} className="card space-y-4 p-5" data-testid="delete-account-form">
      {blockedByOrder && <Alert tone="amber">{t("You have an order in progress. You can delete your account once it's finished.")}</Alert>}
      {state?.error && <Alert tone="red">{t(state.error)}</Alert>}
      <p className="text-sm text-ink-muted">{t("Signed in as {name}", { name: email })}</p>
      <Field label="Your password" error={state?.fieldErrors?.password} htmlFor="del-password">
        <input id="del-password" name="password" type="password" autoComplete="current-password" required className="input" />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 accent-red-600" required />
        <span>{t("I understand my account and data will be permanently deleted.")}</span>
      </label>
      {state?.fieldErrors?.confirm && <p className="text-xs font-medium text-red-600">{t(state.fieldErrors.confirm)}</p>}
      <Button type="submit" variant="danger" block loading={pending} disabled={blockedByOrder}>
        {t("Delete my account permanently")}
      </Button>
    </form>
  );
}

export function ClosureRequestForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(requestClosureAction, undefined);
  if (state?.ok) return <Alert tone="green">{t(state.message ?? "")}</Alert>;
  return (
    <form action={action} className="card space-y-4 p-5">
      {state?.error && <Alert tone="red">{t(state.error)}</Alert>}
      <Field label="Anything we should know? (optional)" htmlFor="closure-note">
        <textarea id="closure-note" name="note" maxLength={300} className="input" rows={3} />
      </Field>
      <Button type="submit" variant="danger" block loading={pending}>
        {t("Request account deletion")}
      </Button>
    </form>
  );
}
