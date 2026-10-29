"use client";

import { useActionState } from "react";
import { updateCustomerProfileAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

export function AccountForm({ name, phone, email }: { name: string; phone: string; email: string }) {
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
      <Field label="Phone" error={state?.fieldErrors?.phone} hint="Used to link your reviews to orders you placed with this number.">
        <input name="phone" type="tel" className="input" defaultValue={phone} />
      </Field>
      <Button type="submit" block loading={pending}>
        Save
      </Button>
    </form>
  );
}
