"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Clock, Eye, Heart, Loader2, Pin, PinOff, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { deleteCreatorReelAction, pinReelAction, requestVerificationAction, retagReelAction } from "@/actions/creators";
import { DishPicker, type PickedDish } from "./dish-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { compactNumber, cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type StudioReel = {
  id: string;
  posterUrl: string | null;
  dish: string;
  restaurant: string;
  status: "PROCESSING" | "READY" | "FAILED";
  tagStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "REMOVED" | "EXPIRED";
  tagNote: string | null;
  live: boolean;
  /** Removed by numnum moderation. */
  moderated: boolean;
  pinned: boolean;
  views: number;
  likes: number;
  orders: number;
  paidPartnership: boolean;
  /** Days before an unanswered tag expires (counted on the server). */
  daysLeft: number | null;
};

export function StudioReels({ reels, pinMax }: { reels: StudioReel[]; pinMax: number }) {
  const t = useT();
  const waiting = reels.filter((r) => r.tagStatus === "PENDING");
  const live = reels.filter((r) => r.live);
  const off = reels.filter((r) => r.tagStatus !== "PENDING" && !r.live);
  const pinned = live.filter((r) => r.pinned).length;
  if (!reels.length)
    return (
      <div className="card p-6 text-center text-ink-muted" data-testid="studio-empty">
        {t("No reels yet. Post your first one and tag the dish.")}
      </div>
    );
  return (
    <div className="space-y-6">
      {!!waiting.length && <Group title={t("Waiting for the restaurant")} reels={waiting} pinned={pinned} pinMax={pinMax} />}
      {!!live.length && <Group title={t("Live ({pinned}/{max} pinned)", { pinned, max: pinMax })} reels={live} pinned={pinned} pinMax={pinMax} />}
      {!!off.length && <Group title={t("Not live")} reels={off} pinned={pinned} pinMax={pinMax} />}
    </div>
  );
}

function Group({ title, reels, pinned, pinMax }: { title: string; reels: StudioReel[]; pinned: number; pinMax: number }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-ink-muted">{title}</h2>
      <ul className="card divide-y divide-black/5">
        {reels.map((r) => (
          <Row key={r.id} r={r} canPin={pinned < pinMax} />
        ))}
      </ul>
    </section>
  );
}

function Row({ r, canPin }: { r: StudioReel; canPin: boolean }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [retag, setRetag] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      toast(t(res.ok ? (res.message ?? "Done") : (res.error ?? "Something went wrong")), res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  const status = r.moderated
    ? { text: t("Removed by numnum: it doesn't follow the content rules"), tone: "text-red-600" }
    : r.status === "PROCESSING"
      ? { text: t("Processing the video…"), tone: "text-ink-muted" }
      : r.status === "FAILED"
        ? { text: t("The video couldn't be processed. Delete it and upload it again."), tone: "text-red-600" }
        : r.tagStatus === "PENDING"
          ? { text: r.daysLeft != null ? t("Waiting for {restaurant} to approve · {n} days left", { restaurant: r.restaurant, n: r.daysLeft }) : t("Waiting for {restaurant} to approve", { restaurant: r.restaurant }), tone: "text-amber-700" }
          : r.tagStatus === "ACCEPTED"
            ? r.live
              ? { text: t("Live"), tone: "text-emerald-700" }
              : { text: t("Not live right now"), tone: "text-ink-muted" }
            : r.tagStatus === "DECLINED"
              ? { text: t("Declined by {restaurant}", { restaurant: r.restaurant }), tone: "text-red-600" }
              : r.tagStatus === "REMOVED"
                ? { text: t("Removed by {restaurant}", { restaurant: r.restaurant }), tone: "text-red-600" }
                : { text: t("{restaurant} didn't answer in 7 days", { restaurant: r.restaurant }), tone: "text-ink-muted" };
  return (
    <li className="flex gap-3 p-3" data-testid="studio-reel" data-tag={r.tagStatus}>
      <Link href={r.live ? `/reel/${r.id}` : "#"} className={cn("relative h-24 w-[54px] shrink-0 overflow-hidden rounded-lg bg-black", !r.live && "pointer-events-none")}>
        {r.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        {r.status === "PROCESSING" && (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        )}
        {r.pinned && (
          <span className="absolute start-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-brand-600">
            <Pin className="h-3 w-3" />
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{r.dish}</div>
        <div className="truncate text-xs text-ink-muted">
          {r.restaurant}
          {r.paidPartnership ? ` · ${t("Paid partnership")}` : ""}
        </div>
        <div className={cn("mt-1 flex items-center gap-1 text-xs font-semibold", status.tone)}>
          {r.tagStatus === "PENDING" && r.status === "READY" && <Clock className="h-3.5 w-3.5" />}
          {status.text}
        </div>
        {r.tagNote && <div className="mt-0.5 text-xs text-ink-muted">“{r.tagNote}”</div>}
        {r.live && (
          <div className="mt-1.5 flex gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {compactNumber(r.views)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" /> {compactNumber(r.likes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="h-3.5 w-3.5" /> {compactNumber(r.orders)}
            </span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {r.live && (
          <button type="button" disabled={pending || (!r.pinned && !canPin)} onClick={() => run(() => pinReelAction(r.id, !r.pinned))} className="inline-flex h-8 items-center gap-1 rounded-full bg-black/5 px-3 text-xs font-bold disabled:opacity-40" data-testid="pin-reel">
            {r.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />} {t(r.pinned ? "Unpin" : "Pin")}
          </button>
        )}
        {!r.live && !r.moderated && r.tagStatus !== "PENDING" && r.tagStatus !== "ACCEPTED" && r.status === "READY" && (
          <button type="button" disabled={pending} onClick={() => setRetag(true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-700" data-testid="retag-reel">
            <RotateCcw className="h-3.5 w-3.5" /> {t("Tag again")}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => window.confirm(t("Delete this reel for good?")) && run(() => deleteCreatorReelAction(r.id))} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-black/5" aria-label={t("Delete")}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <RetagSheet open={retag} onClose={() => setRetag(false)} reelId={r.id} paid={r.paidPartnership} />
    </li>
  );
}

function RetagSheet({ open, onClose, reelId, paid: paidInitial }: { open: boolean; onClose: () => void; reelId: string; paid: boolean }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [dish, setDish] = useState<PickedDish | null>(null);
  const [paid, setPaid] = useState(paidInitial);
  const [pending, start] = useTransition();
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="space-y-4 px-5 pb-6 pt-6">
        <h2 className="text-lg font-extrabold">{t("Tag a dish")}</h2>
        <DishPicker value={dish} onChange={setDish} />
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-5 w-5 accent-brand-500" /> {t("Paid partnership")}
        </label>
        <Button
          block
          size="lg"
          disabled={!dish}
          loading={pending}
          onClick={() =>
            dish &&
            start(async () => {
              const r = await retagReelAction(reelId, dish.id, paid);
              toast(t(r.ok ? (r.message ?? "Sent") : r.error), r.ok ? "success" : "error");
              if (r.ok) {
                onClose();
                router.refresh();
              }
            })
          }
        >
          {t("Send the tag")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Ask for the verified badge (with a short note for the reviewer). */
export function VerificationRequest({ state }: { state: "NONE" | "PENDING" | "APPROVED" | "DECLINED" }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (state === "APPROVED") return null;
  if (state === "PENDING")
    return (
      <div className="card p-4 text-sm" data-testid="verification-pending">
        <b>{t("Verification requested")}</b> · <span className="text-ink-muted">{t("We'll let you know once it's reviewed.")}</span>
      </div>
    );
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1 text-sm">
        <b>{t("Get the verified badge")}</b>
        <div className="text-ink-muted">{state === "DECLINED" ? t("Your last request wasn't approved. You can ask again.") : t("Shows people it's really you, on your profile and reels.")}</div>
      </div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="request-verification">
        {t("Request")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4 px-5 pb-6 pt-6">
          <h2 className="text-lg font-extrabold">{t("Request verification")}</h2>
          <p className="text-sm text-ink-muted">{t("Tell us how to confirm it's you, for example a link to your Instagram where we can message you.")}</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} className="input" data-testid="verification-note" />
          <Button
            block
            size="lg"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await requestVerificationAction(note);
                toast(t(r.ok ? (r.message ?? "Sent") : r.error), r.ok ? "success" : "error");
                if (r.ok) {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
            data-testid="send-verification"
          >
            {t("Send request")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
