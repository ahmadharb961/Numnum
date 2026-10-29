"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdjustmentAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function AdjustmentForm({ restaurantId, invoiceId, commissionEventId }: { restaurantId: string; invoiceId?: string; commissionEventId?: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approve, setApprove] = useState(true);
  const [apply, setApply] = useState(!!invoiceId);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Amount (USD)">
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-2.80" />
        </Field>
        <Field label="Reason (shown on invoice)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill credit for duplicate order" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} className="accent-brand-500" /> Approve now (otherwise a second admin approves)
      </label>
      {invoiceId && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={apply} disabled={!approve} onChange={(e) => setApply(e.target.checked)} className="accent-brand-500" /> Apply to this invoice as a credit/debit note
        </label>
      )}
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await createAdjustmentAction({ restaurantId, amount, reason, approve, commissionEventId, applyToInvoiceId: apply && approve ? invoiceId : undefined });
            toast(r.ok ? r.message ?? "Saved" : r.error, r.ok ? "success" : "error");
            if (r.ok) {
              setAmount("");
              setReason("");
            }
            router.refresh();
          })
        }
      >
        Record adjustment
      </Button>
    </div>
  );
}
