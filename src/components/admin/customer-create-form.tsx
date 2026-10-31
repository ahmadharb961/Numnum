"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAdminAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

const EMPTY = { name: "", email: "", phone: "", password: "" };

/** Admin: create a customer account with a temporary password. */
export function CustomerCreateForm() {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = (k: keyof typeof EMPTY, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={`c-${k}`} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />;
  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-extrabold">Add a customer</h2>
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Full name" error={errors.name} htmlFor="c-name">{input("name")}</Field>
        <Field label="Email (login)" error={errors.email} htmlFor="c-email">{input("email", { type: "email" })}</Field>
        <Field label="Phone (optional)" error={errors.phone} htmlFor="c-phone">{input("phone", { type: "tel", placeholder: "70 123 456" })}</Field>
        <Field label="Temporary password" error={errors.password} htmlFor="c-password">{input("password", { placeholder: "min 8 characters", autoComplete: "new-password" })}</Field>
      </div>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await createCustomerAdminAction(f);
            if (r.ok) {
              setMsg({ ok: true, text: `${r.message}. They can log in with ${f.email} and the temporary password.` });
              setErrors({});
              setF(EMPTY);
              router.refresh();
            } else {
              setErrors(r.fieldErrors ?? {});
              setMsg(r.error ? { ok: false, text: r.error } : null);
            }
          })
        }
      >
        Create customer
      </Button>
    </div>
  );
}
