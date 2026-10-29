"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewPaymentAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function PaymentReviewForm({ paymentId, amountCents }: { paymentId: string; amountCents: number }) {
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const go = (action: "APPROVE" | "REJECT" | "MORE_INFO") =>
    start(async () => {
      const r = await reviewPaymentAction(paymentId, action, amount, note);
      toast(r.ok ? r.message ?? "Done" : r.error, r.ok ? "success" : "error");
      router.refresh();
    });
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label>
          <span className="label">Verified amount (USD)</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          <span className="label">Note to restaurant</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required for reject / more info" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-5 w-5 accent-brand-500" />I confirmed the funds were received in the Whish account
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!confirmed} loading={pending} onClick={() => go("APPROVE")}>
          Approve{Number(amount) * 100 < amountCents ? " partial payment" : ""}
        </Button>
        <Button size="sm" variant="outline" loading={pending} onClick={() => go("MORE_INFO")}>
          Request more evidence
        </Button>
        <Button size="sm" variant="danger" loading={pending} onClick={() => go("REJECT")}>
          Reject
        </Button>
      </div>
    </div>
  );
}
