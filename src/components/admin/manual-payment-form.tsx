"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordManualPaymentAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function ManualPaymentForm({ invoiceId, outstandingCents }: { invoiceId: string; outstandingCents: number }) {
  const [amount, setAmount] = useState((outstandingCents / 100).toFixed(2));
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount received (USD)">
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Whish reference">
          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <Field label="Reconciliation note">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Matched on Whish statement 2026-11-04" />
      </Field>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          confirm("Record this payment as verified?") &&
          start(async () => {
            const r = await recordManualPaymentAction(invoiceId, amount, ref, note);
            toast(r.ok ? r.message ?? "Recorded" : r.error, r.ok ? "success" : "error");
            router.refresh();
          })
        }
      >
        Record payment
      </Button>
    </div>
  );
}
