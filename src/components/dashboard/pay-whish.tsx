"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Upload, Wallet, X } from "lucide-react";
import { submitPaymentAction } from "@/actions/billing";
import { uploadFile } from "./upload";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Whish = { recipientName: string; whishNumber: string; accountId: string; instructions: string };

export function PayWhishButton({ invoice, whish, block }: { invoice: { id: string; number: string; outstandingCents: number }; whish: Whish; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"instructions" | "submit">("instructions");
  return (
    <>
      <Button size="lg" block={block} onClick={() => { setOpen(true); setStep("instructions"); }}>
        <Wallet className="h-5 w-5" /> Pay via Whish
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={step === "instructions" ? "Pay via Whish" : "Submit payment proof"}>
        {step === "instructions" ? <Instructions invoice={invoice} whish={whish} onPaid={() => setStep("submit")} /> : <SubmitProof invoice={invoice} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="truncate font-mono font-semibold">{value}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="chip h-9 shrink-0 text-xs"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Instructions({ invoice, whish, onPaid }: { invoice: { number: string; outstandingCents: number }; whish: Whish; onPaid: () => void }) {
  const configured = whish.whishNumber || whish.accountId;
  return (
    <div className="space-y-4 p-5">
      <div className="rounded-2xl bg-brand-50 p-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Amount due</div>
        <div className="tabular text-3xl font-black text-brand-700">{formatMoney(invoice.outstandingCents)}</div>
      </div>
      {!configured ? (
        <Alert tone="amber">Payment details haven&apos;t been configured yet. Please contact numnum support.</Alert>
      ) : (
        <div className="divide-y divide-black/5 rounded-2xl border border-black/10 px-4">
          <CopyRow label="Recipient" value={whish.recipientName} />
          <CopyRow label="Whish number" value={whish.whishNumber} />
          <CopyRow label="Account ID" value={whish.accountId} />
          <CopyRow label="Payment reference (put in the transfer note)" value={invoice.number} />
          <CopyRow label="Amount (USD)" value={(invoice.outstandingCents / 100).toFixed(2)} />
        </div>
      )}
      {whish.instructions && <p className="text-sm text-ink-soft">{whish.instructions}</p>}
      <Button size="lg" block onClick={onPaid} disabled={!configured}>
        I&apos;ve made the payment
      </Button>
      <p className="text-center text-xs text-ink-muted">Your invoice is marked paid only after our team confirms the funds were received.</p>
    </div>
  );
}

function SubmitProof({ invoice, onDone }: { invoice: { id: string; number: string; outstandingCents: number }; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState((invoice.outstandingCents / 100).toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [receipts, setReceipts] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await submitPaymentAction({ invoiceId: invoice.id, amount, paymentDate: date, whishReference: ref, receiptIds: receipts.map((x) => x.id) });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        toast(r.message ?? "Submitted", "success");
        onDone();
        router.refresh();
      }}
    >
      {error && <Alert tone="red">{error}</Alert>}
      <Field label="Invoice number">
        <input className="input font-mono" value={invoice.number} readOnly />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount transferred (USD)">
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Payment date">
          <input className="input" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Whish transaction reference">
        <input className="input font-mono" value={ref} onChange={(e) => setRef(e.target.value)} required placeholder="e.g. WH12345678" />
      </Field>
      <div>
        <div className="label">Receipt screenshot or photo</div>
        <div className="flex flex-wrap gap-2">
          {receipts.map((r) => (
            <span key={r.id} className="chip h-9 text-xs">
              {r.name}
              <button type="button" onClick={() => setReceipts(receipts.filter((x) => x.id !== r.id))} aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" /> Attach receipt
          </Button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Stored privately. Only you and numnum administrators can see it.</p>
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setUploading(true);
            try {
              const up = await uploadFile(f, "receipt");
              setReceipts((r) => [...r, { id: up.id, name: f.name }]);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <Button type="submit" size="lg" block loading={busy}>
        Submit for verification
      </Button>
    </form>
  );
}
