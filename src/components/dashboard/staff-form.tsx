"use client";

import { useActionState } from "react";
import { addStaffAction } from "@/actions/restaurant";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

export function AddStaffForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addStaffAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={fe.email}>
          <input name="email" type="email" className="input" required />
        </Field>
        <Field label="Role">
          <select name="role" className="input" defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>
        <Field label="Name (for new accounts)" error={fe.name}>
          <input name="name" className="input" />
        </Field>
        <Field label="Temporary password (for new accounts)" error={fe.password} hint="Share it securely; they can log in at /login">
          <input name="password" type="text" className="input" autoComplete="off" />
        </Field>
      </div>
      <Button type="submit" loading={pending}>
        Add team member
      </Button>
    </form>
  );
}
