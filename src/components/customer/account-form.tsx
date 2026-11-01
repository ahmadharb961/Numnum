"use client";

import { useActionState } from "react";
import { updateCustomerProfileAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export function AccountForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(updateCustomerProfileAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      <Field label="Email">
        <input className="input" value={email} disabled />
      </Field>
      <Field label="Name" error={state?.fieldErrors?.name}>
        <input name="name" className="input" defaultValue={name} />
      </Field>
      <Field label="Mobile number" error={state?.fieldErrors?.phone} hint="Restaurants contact you on WhatsApp or by phone about your orders.">
        <input name="phone" type="tel" className="input" defaultValue={phone} required placeholder="70 123 456" />
      </Field>
      <Button type="submit" block loading={pending}>
        {t("Save")}
      </Button>
    </form>
  );
}
