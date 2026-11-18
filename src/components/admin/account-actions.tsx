"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, UserCheck, UserX } from "lucide-react";
import { changeLoginEmailAction, deleteAccountAdminAction, sendPasswordResetAdminAction, setAccountDisabledAction, updateAccountAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

type Props = { id: string; name: string; email: string; phone: string; disabled: boolean; isAdmin: boolean; isSelf: boolean; deleteBlocked: string | null };

/** Admin → Customers → a person: edit, password reset email, disable/enable, delete. */
export function AccountActions(p: Props) {
  const router = useRouter();
  const [f, setF] = useState({ name: p.name, phone: p.phone, email: p.email });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; field?: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      setFieldErr({});
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: r.message ?? "Done" });
        // No refresh when the action moves on (delete redirects): it would race that navigation.
        if (after) after();
        else router.refresh();
      } else if (r.field) setFieldErr({ [r.field]: r.error ?? "" });
      else setMsg({ ok: false, text: r.error ?? "Something went wrong" });
    });

  const save = () =>
    run(async () => {
      const r = await updateAccountAction(p.id, { name: f.name, phone: f.phone });
      if (!r.ok || f.email.trim().toLowerCase() === p.email) return r;
      const e = await changeLoginEmailAction(p.id, f.email);
      return e.ok ? { ok: true, message: e.message } : { ok: false, error: e.error, field: "email" };
    });

  return (
    <div className="space-y-5" data-testid="account-actions">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <section className="card space-y-4 p-5">
        <h2 className="font-extrabold">Edit</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name" error={fieldErr.name} htmlFor="a-name">
            <input id="a-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email (login)" error={fieldErr.email} htmlFor="a-email">
            <input id="a-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Mobile" error={fieldErr.phone} htmlFor="a-phone">
            <input id="a-phone" type="tel" className="input" value={f.phone} placeholder="70 123 456" onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Button onClick={save} loading={pending} data-testid="account-save">
          Save changes
        </Button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-extrabold">Access</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(() => sendPasswordResetAdminAction(p.id))} disabled={pending} data-testid="account-reset">
            <KeyRound className="h-4 w-4" /> Email a password reset link
          </Button>
          {!p.isAdmin && !p.isSelf && (
            <Button variant="outline" onClick={() => run(() => setAccountDisabledAction(p.id, !p.disabled))} disabled={pending} data-testid="account-disable">
              {p.disabled ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {p.disabled ? "Enable login" : "Disable login"}
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-muted">A disabled account is logged out everywhere and can&apos;t log in until enabled again. Nothing is deleted.</p>
      </section>

      <section className="card space-y-3 border border-red-100 p-5">
        <h2 className="font-extrabold text-red-700">Delete account</h2>
        {p.deleteBlocked ? (
          <p className="text-sm text-ink-muted" data-testid="account-delete-blocked">{p.deleteBlocked}</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">Removes their personal data, saved items, likes, follows and reviews (and a food creator&apos;s reels). Past orders stay for the restaurants&apos; records, without their name, phone or address. This can&apos;t be undone.</p>
            <Button
              variant="outline"
              className="border-red-200 text-red-700"
              disabled={pending}
              data-testid="account-delete"
              onClick={() => {
                if (!window.confirm(`Delete ${p.name}'s account for good?`)) return;
                run(() => deleteAccountAdminAction(p.id), () => {}); // the action redirects to the list
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
