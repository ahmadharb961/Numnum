"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyReviewAction, reportReviewAction } from "@/actions/restaurant";
import { Stars, Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

type Review = { id: string; rating: number; body: string | null; reply: string | null; createdAt: string; user: string; subject: string; evidence: string; hidden: boolean };

export function ReviewList({ reviews, kind, canReply }: { reviews: Review[]; kind: "item" | "restaurant"; canReply: boolean }) {
  if (!reviews.length) return <div className="card"><EmptyState title="No reviews yet" body="Reviews from customers will appear here." /></div>;
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard key={r.id} r={r} kind={kind} canReply={canReply} />
      ))}
    </ul>
  );
}

function ReviewCard({ r, kind, canReply }: { r: Review; kind: "item" | "restaurant"; canReply: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.reply ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      toast(res.ok ? res.message ?? "Done" : res.error ?? "Failed", res.ok ? "success" : "error");
      setEditing(false);
      router.refresh();
    });
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stars value={r.rating} />
          <span className="text-sm font-semibold">{r.user.split(" ")[0]}</span>
          {r.evidence !== "UNVERIFIED" && <Badge tone="green">{r.evidence === "FULFILLED_ORDER" ? "Fulfilled order" : "Acknowledged order"}</Badge>}
          {r.hidden && <Badge tone="red">Hidden by moderators</Badge>}
        </div>
        <span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span>
      </div>
      {r.subject && <div className="mt-1 text-xs font-semibold text-ink-muted">{r.subject}</div>}
      {r.body && <p className="mt-2 text-sm">{r.body}</p>}
      {r.reply && !editing && (
        <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm">
          <div className="text-xs font-bold text-ink-muted">Your reply</div>
          {r.reply}
        </div>
      )}
      {editing && (
        <div className="mt-3 space-y-2">
          <textarea className="input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the customer or address their feedback. Replies are public." />
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => replyReviewAction(kind, r.id, text))}>
              Post reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {canReply && !editing && (
        <div className="mt-3 flex gap-4 text-xs font-semibold">
          <button className="text-brand-600" onClick={() => setEditing(true)}>
            {r.reply ? "Edit reply" : "Reply"}
          </button>
          {r.reply && (
            <button className="text-ink-muted" onClick={() => run(() => replyReviewAction(kind, r.id, ""))}>
              Delete reply
            </button>
          )}
          <button
            className="text-ink-muted"
            onClick={() => {
              const reason = prompt("Why should moderators review this? (e.g. fake review, offensive)");
              if (reason) run(() => reportReviewAction(kind, r.id, reason.slice(0, 200)));
            }}
          >
            Report
          </button>
        </div>
      )}
    </li>
  );
}
