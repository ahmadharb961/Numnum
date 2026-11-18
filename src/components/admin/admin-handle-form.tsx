"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign } from "lucide-react";
import { adminChangeCreatorHandleAction, adminCheckHandleAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

/** Admin → a creator's account: change their username any time, with the live availability check. */
export function AdminHandleForm({ creatorId, handle }: { creatorId: string; handle: string }) {
  const router = useRouter();
  const [v, setV] = useState(handle);
  const [status, setStatus] = useState<{ for: string; available: boolean; current?: boolean; error?: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const clean = v.trim().replace(/^@/, "").toLowerCase();
  useEffect(() => {
    if (clean.length < 3) return setStatus(null);
    let live = true;
    const t = setTimeout(async () => {
      const r = await adminCheckHandleAction(creatorId, clean).catch(() => null);
      if (live && r) setStatus({ for: clean, ...r });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [clean, creatorId]);
  const now = status?.for === clean ? status : null;
  return (
    <div className="mt-3 space-y-2" data-testid="admin-handle-form">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <AtSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input value={v} onChange={(e) => setV(e.target.value.replace(/\s+/g, "").toLowerCase())} className="input h-10 w-56 ps-9" dir="ltr" aria-label="Username" data-testid="admin-handle-input" />
        </span>
        <Button
          size="sm"
          loading={pending}
          disabled={!now?.available || !!now.current}
          data-testid="admin-handle-save"
          onClick={() =>
            start(async () => {
              const r = await adminChangeCreatorHandleAction(creatorId, clean);
              setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          Change username
        </Button>
      </div>
      <p className="text-xs" data-testid="admin-handle-status">
        {now ? (now.current ? <span className="text-ink-muted">Their current username</span> : now.available ? <span className="font-semibold text-emerald-700">✓ Available</span> : <span className="font-semibold text-red-600">{now.error}</span>) : <span className="text-ink-muted">Admins can change it any time; their old username redirects for 3 months.</span>}
      </p>
      {msg && <p className={msg.ok ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-600"}>{msg.text}</p>}
    </div>
  );
}
