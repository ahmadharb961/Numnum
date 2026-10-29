"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { acknowledgeByReferenceAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AckByReference() {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ref.trim()) return;
        setBusy(true);
        const r = await acknowledgeByReferenceAction(ref);
        setBusy(false);
        if (r.ok) {
          toast(r.message ?? "Acknowledged", "success");
          setRef("");
          router.push(`/dashboard/orders?tab=active`);
        } else toast(r.error, "error");
      }}
    >
      <label className="min-w-[220px] flex-1">
        <span className="label">Got a WhatsApp order? Enter its reference</span>
        <input className="input font-mono uppercase" placeholder="NN-2026-000125" value={ref} onChange={(e) => setRef(e.target.value)} autoCapitalize="characters" />
      </label>
      <Button type="submit" loading={busy} className="h-12">
        <CheckCircle2 className="h-4 w-4" /> Acknowledge
      </Button>
    </form>
  );
}
