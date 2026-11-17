"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { BadgeCheck, Ban, Check, Eye, Handshake, Heart, ShoppingBag, UserRound, X } from "lucide-react";
import { blockCreatorAction, decideTagAction, removeTagAction } from "@/actions/creators";
import { HlsVideo } from "@/components/hls-video";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { compactNumber } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useT } from "@/i18n/client";

export type TagCreator = { id: string; handle: string; name: string; avatarUrl: string | null; verified: boolean; followers: number };
export type PendingTag = { id: string; videoUrl: string | null; posterUrl: string | null; caption: string | null; dish: string; paidPartnership: boolean; creator: TagCreator; requestedAt: string };
export type LiveTag = { id: string; posterUrl: string | null; dish: string; paidPartnership: boolean; creator: TagCreator; views: number; likes: number; orders: number; revenueCents: number };

function useRun() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(t(r.ok ? (r.message ?? "Done") : (r.error ?? "Something went wrong")), r.ok ? "success" : "error");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

function CreatorLine({ c }: { c: TagCreator }) {
  const t = useT();
  return (
    <Link href={`/c/${c.handle}`} target="_blank" className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-bold">
          <span className="truncate">{c.name}</span>
          {c.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          <span dir="ltr">@{c.handle}</span> · {t(c.followers === 1 ? "{n} follower" : "{n} followers", { n: compactNumber(c.followers) })}
        </span>
      </span>
    </Link>
  );
}

/** A creator's tag waiting for the restaurant: watch it, then accept or decline (with a reason). */
export function PendingTagCard({ tag }: { tag: PendingTag }) {
  const t = useT();
  const { pending, run } = useRun();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="card overflow-hidden" data-testid="pending-tag">
      <div className="grid gap-4 p-4 sm:grid-cols-[200px_1fr]">
        <div className="mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-2xl bg-black">
          {tag.videoUrl && <HlsVideo src={tag.videoUrl} poster={tag.posterUrl ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 space-y-3">
          <CreatorLine c={tag.creator} />
          <div className="rounded-xl bg-cream p-3 text-sm">
            <div>
              {t("Tagged dish")}: <b>{tag.dish}</b>
            </div>
            {tag.caption && <div className="mt-1 text-ink-soft">“{tag.caption}”</div>}
            {tag.paidPartnership && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                <Handshake className="h-3.5 w-3.5" /> {t("Marked as a paid partnership")}
              </div>
            )}
          </div>
          <p className="text-xs text-ink-muted">{t("Accept and it goes live with an Order button for this dish. You can remove it later.")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => decideTagAction(tag.id, true))} data-testid="accept-tag">
              <Check className="h-4 w-4" /> {t("Accept")}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)} data-testid="decline-tag">
              <X className="h-4 w-4" /> {t("Decline")}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(t("Block @{handle}? They won't be able to tag you anymore.", { handle: tag.creator.handle })) && run(() => blockCreatorAction(tag.creator.id, true))}>
              <Ban className="h-4 w-4" /> {t("Block")}
            </Button>
          </div>
        </div>
      </div>
      <Sheet open={declining} onClose={() => setDeclining(false)}>
        <div className="space-y-4 px-5 pb-6 pt-6">
          <h2 className="text-lg font-extrabold">{t("Decline this tag")}</h2>
          <p className="text-sm text-ink-muted">{t("Optional: tell the creator why (they'll see it).")}</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} className="input" placeholder={t("e.g. This isn't our dish")} data-testid="decline-reason" />
          <Button block size="lg" variant="danger" loading={pending} onClick={() => run(() => decideTagAction(tag.id, false, reason), () => setDeclining(false))} data-testid="confirm-decline">
            {t("Decline")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** A live creator reel on the restaurant's dish, with what it brought; it can be taken off. */
export function LiveTagRow({ tag, currency }: { tag: LiveTag; currency: string }) {
  const t = useT();
  const { pending, run } = useRun();
  return (
    <li className="flex gap-3 p-3" data-testid="live-tag">
      <Link href={`/reel/${tag.id}`} className="h-24 w-[54px] shrink-0 overflow-hidden rounded-lg bg-black">
        {tag.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tag.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-1.5">
        <CreatorLine c={tag.creator} />
        <div className="truncate text-sm">
          {tag.dish}
          {tag.paidPartnership ? <span className="text-ink-muted"> · {t("Paid partnership")}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {compactNumber(tag.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {compactNumber(tag.likes)}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <ShoppingBag className="h-3.5 w-3.5" /> {t(tag.orders === 1 ? "{n} order" : "{n} orders", { n: tag.orders })} · {formatMoney(tag.revenueCents, currency)}
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const note = window.prompt(t("Remove this reel from your dish? Optional: tell the creator why."), "");
          if (note !== null) run(() => removeTagAction(tag.id, note));
        }}
        className="h-8 shrink-0 self-start rounded-full bg-black/5 px-3 text-xs font-bold"
        data-testid="remove-tag"
      >
        {t("Remove")}
      </button>
    </li>
  );
}

export function UnblockButton({ creatorId }: { creatorId: string }) {
  const t = useT();
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => blockCreatorAction(creatorId, false))}>
      {t("Unblock")}
    </Button>
  );
}
