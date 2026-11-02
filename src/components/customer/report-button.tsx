"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "./track";
import { useT } from "@/i18n/client";
import { useLoginGate } from "./login-gate";

const REASONS = ["Spam", "Offensive or inappropriate", "Misleading information", "Fake review", "Copyright", "Food safety concern", "Other"] as const;

type BlockTarget = { restaurantId: string } | { reviewId: string; reviewType: "ITEM" | "RESTAURANT" };

export function ReportButton({ targetType, targetId, label, dark, rail, next, block }: { targetType: "REEL" | "ITEM_REVIEW" | "RESTAURANT_REVIEW" | "RESTAURANT" | "MENU_ITEM"; targetId: string; label?: string; dark?: boolean; rail?: boolean; next?: string; block?: { target: BlockTarget; name: string } }) {
  const t = useT();
  const router = useRouter();
  const [alsoBlock, setAlsoBlock] = useState(true);
  const { requireLogin, askLogin } = useLoginGate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <>
      {rail ? (
        // Reel action rail style (white icon over the video)
        <button onClick={() => requireLogin("report", next) && setOpen(true)} className="flex flex-col items-center gap-0.5 text-[11px] font-semibold text-white text-shadow" aria-label={t(label ?? "Report")}>
          <Flag className="h-6 w-6 drop-shadow" />
          {t("Report")}
        </button>
      ) : (
        <button onClick={() => requireLogin("report", next) && setOpen(true)} className={`inline-flex items-center gap-1 text-xs ${dark ? "text-white/70" : "text-ink-muted"}`}>
          <Flag className="h-3 w-3" /> {t(label ?? "Report")}
        </button>
      )}
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
          {block && (
            <label className="flex items-start gap-3 rounded-xl bg-black/[0.03] p-3 text-sm" data-testid="report-also-block">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-500" />
              <span>
                <b>{t("Also hide content from {name}", { name: block.name })}</b>
                <span className="block text-xs text-ink-muted">{t("You can undo this any time from Account → Blocked.")}</span>
              </span>
            </label>
          )}
          <Button
            block
            disabled={!reason}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/reports", { targetType, targetId, reason, details: details || undefined });
                if (block && alsoBlock) {
                  await api("/api/blocks", block.target);
                  toast(t("Thanks — {name} is now hidden for you", { name: block.name }), "success");
                  setOpen(false);
                  router.refresh();
                } else {
                  toast(t("Thanks — our team will review it"), "success");
                  setOpen(false);
                }
              } catch (e) {
                if ((e as { status?: number }).status === 401) {
                  setOpen(false);
                  askLogin("report", next);
                } else toast((e as Error).message, "error");
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
