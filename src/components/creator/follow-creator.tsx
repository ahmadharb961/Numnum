"use client";

import Link from "@/components/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, PlayCircle, UserPlus, Users } from "lucide-react";
import { followCreatorAction } from "@/actions/creators";
import { useToast } from "@/components/ui/toast";
import { compactNumber, cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Follow a creator: instant on screen, saved in the background (undone if it fails). */
export function FollowCreatorButton({ creatorId, handle, initialFollowing, initialCount, loggedIn, self }: { creatorId: string; handle: string; initialFollowing: boolean; initialCount: number; loggedIn: boolean; self: boolean }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [, start] = useTransition();
  const toggle = () => {
    if (!loggedIn) return router.push(`/login?next=${encodeURIComponent(`/c/${handle}`)}`);
    const next = !following;
    setFollowing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    start(async () => {
      const r = await followCreatorAction(creatorId, next);
      if (r.ok) {
        setFollowing(r.following);
        setCount(r.followerCount);
      } else {
        setFollowing(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        if (r.login) router.push(`/login?next=${encodeURIComponent(`/c/${handle}`)}`);
        else toast(t(r.error ?? "Couldn't update. Check your connection."), "error");
      }
    });
  };
  return (
    <div className="flex items-center gap-3">
      {!self && (
        <button type="button" onClick={toggle} className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-bold transition active:scale-95", following ? "bg-black/5 text-ink" : "bg-brand-500 text-white")} data-testid="follow-creator">
          {following ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {t(following ? "Following" : "Follow")}
        </button>
      )}
      {self ? (
        <Link href="/creator/followers" className="text-sm font-semibold text-brand-600" data-testid="creator-followers">
          {t(count === 1 ? "{n} follower" : "{n} followers", { n: compactNumber(count) })} ›
        </Link>
      ) : (
        <span className="text-sm text-ink-muted" data-testid="creator-followers">
          {t(count === 1 ? "{n} follower" : "{n} followers", { n: compactNumber(count) })}
        </span>
      )}
    </div>
  );
}

/**
 * The creator's numbers (reels · followers · reel views) with the Follow button above them for
 * visitors: following changes the count at once. On their own profile, "followers" opens the list.
 */
export function CreatorStats({ creatorId, handle, initialFollowing, initialCount, loggedIn, self, reels, views }: { creatorId: string; handle: string; initialFollowing: boolean; initialCount: number; loggedIn: boolean; self: boolean; reels: number; views: number }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [, start] = useTransition();
  const toggle = () => {
    if (!loggedIn) return router.push(`/login?next=${encodeURIComponent(`/c/${handle}`)}`);
    const next = !following;
    setFollowing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    start(async () => {
      const r = await followCreatorAction(creatorId, next);
      if (r.ok) {
        setFollowing(r.following);
        setCount(r.followerCount);
      } else {
        setFollowing(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        if (r.login) router.push(`/login?next=${encodeURIComponent(`/c/${handle}`)}`);
        else toast(t(r.error ?? "Couldn't update. Check your connection."), "error");
      }
    });
  };
  const cell = "flex min-w-0 flex-col items-center gap-1 px-1 text-center";
  const followers = (
    <>
      <Users className="h-6 w-6 text-brand-500" />
      <span className="tabular text-2xl font-black leading-none">{compactNumber(count)}</span>
      <span className="text-xs text-ink-muted">{t("followers")}</span>
    </>
  );
  return (
    <div className="w-full">
      {!self && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={toggle} className={cn("inline-flex h-11 min-w-40 items-center justify-center gap-1.5 rounded-full px-6 font-bold transition active:scale-95", following ? "bg-black/5 text-ink" : "bg-brand-500 text-white shadow-md shadow-brand-500/30")} data-testid="follow-creator">
            {following ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {t(following ? "Following" : "Follow")}
          </button>
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 divide-x divide-brand-100 rounded-2xl bg-brand-50/70 py-4 ring-1 ring-brand-100 rtl:divide-x-reverse" data-testid="creator-stats">
        <div className={cell}>
          <Clapperboard className="h-6 w-6 text-brand-500" />
          <span className="tabular text-2xl font-black leading-none">{compactNumber(reels)}</span>
          <span className="text-xs text-ink-muted">{t("reels")}</span>
        </div>
        {self ? (
          <Link href="/creator/followers" className={cell} data-testid="creator-followers">
            {followers}
          </Link>
        ) : (
          <span className={cell} data-testid="creator-followers">
            {followers}
          </span>
        )}
        <div className={cell}>
          <PlayCircle className="h-6 w-6 text-brand-500" />
          <span className="tabular text-2xl font-black leading-none">{compactNumber(views)}</span>
          <span className="text-xs text-ink-muted">{t("reel views")}</span>
        </div>
      </div>
    </div>
  );
}
