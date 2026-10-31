"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "./track";
import { useT } from "@/i18n/client";

const REASONS = ["Spam", "Offensive or inappropriate", "Misleading information", "Fake review", "Copyright", "Food safety concern", "Other"] as const;

export function ReportButton({ targetType, targetId, label, dark }: { targetType: "REEL" | "ITEM_REVIEW" | "RESTAURANT_REVIEW" | "RESTAURANT" | "MENU_ITEM"; targetId: string; label?: string; dark?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <>
      <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-1 text-xs ${dark ? "text-white/70" : "text-ink-muted"}`}>
        <Flag className="h-3 w-3" /> {t(label ?? "Report")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Report content">
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={`chip ${reason === r ? "chip-active" : ""}`}>
                {t(r)}
              </button>
            ))}
          </div>
          <textarea className="input" placeholder={t("Anything else we should know? (optional)")} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button
            block
            disabled={!reason}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/reports", { targetType, targetId, reason, details: details || undefined });
                toast("Thanks — our team will review it", "success");
                setOpen(false);
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Submit report")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
