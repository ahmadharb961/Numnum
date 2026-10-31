"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openDisputeAction } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const REASONS = ["Order wasn't actually delivered (auto-completed)", "Customer refused or didn't pay", "Duplicate of another order", "Wrong amount", "Fake or prank order", "Other"];

export function DisputeButton({ commissionEventId, invoiceId, label = "Dispute", small }: { commissionEventId?: string; invoiceId?: string; label?: string; small?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn("font-semibold text-ink-muted underline-offset-2 hover:underline", small ? "text-xs" : "text-sm")}>
        {t(label)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Open a dispute">
        <div className="space-y-3 p-5">
          {error && <Alert tone="red">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} onClick={() => setReason(t(r))} className={cn("chip text-xs", reason === t(r) && "chip-active")}>
                {t(r)}
              </button>
            ))}
          </div>
          <textarea className="input" placeholder={t("Explain what happened. Include any evidence (screenshots can be shared with support).")} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
          <p className="text-xs text-ink-muted">{t("Disputed entries are excluded from invoicing until reviewed. Accepted disputes are credited on your next invoice.")}</p>
          <Button
            block
            loading={busy}
            disabled={!reason}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await openDisputeAction({ commissionEventId, invoiceId, reason, details });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast(r.message ?? "Submitted", "success");
              setOpen(false);
              router.refresh();
            }}
          >
            {t("Submit dispute")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
