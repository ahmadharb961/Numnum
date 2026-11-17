import Link from "next/link";
import { BadgeCheck, UserRound } from "lucide-react";
import type { ExploreCreator } from "@/server/explore-search";
import { compactNumber } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** A food creator in search results: photo, name, @username, a line of bio, followers and reels. */
export function CreatorCard({ c }: { c: ExploreCreator }) {
  const t = useT();
  return (
    <Link href={`/c/${c.handle}`} className="card flex items-center gap-3 p-3 transition active:scale-[0.99]" data-testid="creator-result">
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <UserRound className="h-6 w-6" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-bold">
          <span className="truncate">{c.displayName}</span>
          {c.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label={t("Verified")} />}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          <span dir="ltr">@{c.handle}</span>
          {c.area ? ` · ${c.area}` : ""}
        </span>
        {c.bio && <span className="mt-0.5 block truncate text-sm text-ink-soft">{c.bio}</span>}
      </span>
      <span className="shrink-0 text-end text-xs text-ink-muted">
        <span className="block text-base font-black tabular text-ink">{compactNumber(c.followerCount)}</span>
        {t("followers")}
        <span className="mt-0.5 block">{t(c.reelCount === 1 ? "{n} reel" : "{n} reels", { n: c.reelCount })}</span>
      </span>
    </Link>
  );
}
