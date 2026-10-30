"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptAgreementAction, publishProfileAction, markNotificationsReadAction, removeStaffAction } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done" : r.error ?? "Failed" });
      router.refresh();
    });
  return { pending, msg, run };
}

export function AcceptAgreement() {
  const [checked, setChecked] = useState(false);
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <label className="flex items-start gap-3 text-sm font-semibold">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-500" />I have read and accept the commission agreement on behalf of my restaurant.
      </label>
      <Button size="lg" disabled={!checked} loading={pending} onClick={() => run(acceptAgreementAction)}>
        Accept and enable online ordering
      </Button>
    </div>
  );
}

export function PublishButton({ disabled }: { disabled?: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <Button size="lg" disabled={disabled} loading={pending} onClick={() => run(publishProfileAction)}>
        Publish my restaurant
      </Button>
    </div>
  );
}

export function MarkAllRead() {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(markNotificationsReadAction)}>
      Mark all as read
    </Button>
  );
}

export function RemoveStaff({ id }: { id: string }) {
  const toast = useToast();
  const { pending, run } = useRun();
  return (
    <button
      disabled={pending}
      className="text-xs font-semibold text-red-600"
      onClick={() =>
        confirm("Remove this person's access?") &&
        run(async () => {
          const r = await removeStaffAction(id);
          if (!r.ok) toast(r.error, "error");
          return r;
        })
      }
    >
      Remove
    </button>
  );
}
