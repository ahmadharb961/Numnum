import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, Instagram, MapPin, Music2, Share, UserRound } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { publicReelWhere } from "@/server/feed";
import { creatorFavorites, creatorGridOrder, handleRedirect } from "@/server/creators";
import { BackButton } from "@/components/back-button";
import { CreatorStats } from "@/components/creator/follow-creator";
import { CreatorMoreMenu, CreatorProfileTabs } from "@/components/creator/creator-profile-tabs";
import { ShareButton } from "@/components/customer/restaurant-profile";
import { creatorResults } from "@/server/creator-results";
import Link from "@/components/link";
import { compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

const social = (v: string | null, base: string) => (!v ? null : /^https?:\/\//.test(v) ? v : `${base}${v.replace(/^@/, "")}`);

async function load(handle: string) {
  return prisma.creator.findFirst({ where: { handle: handle.toLowerCase(), status: "APPROVED" } });
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const c = await load((await params).handle);
  if (!c) return { title: "numnum" };
  return { title: `${c.displayName} (@${c.handle})`, description: c.bio ?? undefined, openGraph: { title: `${c.displayName} (@${c.handle}) on numnum`, description: c.bio ?? undefined, images: c.avatarUrl ? [c.avatarUrl] : undefined } };
}

/** A food creator's public profile: who they are, pinned reels first, then their newest, and the reels they saved. */
export default async function CreatorProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const t = await getT();
  const c = await load((await params).handle);
  if (!c) {
    // An old username (changed in the last 3 months): to the creator's profile under the new one.
    const moved = await handleRedirect((await params).handle);
    if (moved) permanentRedirect(`/c/${moved}`);
    notFound();
  }
  const me = await getCurrentUser();
  const [reels, follow, favorites] = await Promise.all([
    prisma.reel.findMany({ where: { ...publicReelWhere, creatorId: c.id }, orderBy: creatorGridOrder, select: { id: true, posterUrl: true, viewCount: true, pinnedAt: true, menuItem: { select: { name: true } } } }),
    me ? prisma.creatorFollow.findUnique({ where: { userId_creatorId: { userId: me.id, creatorId: c.id } } }) : null,
    creatorFavorites(c.userId),
  ]);
  // Shared results: a proof badge (orders their reels brought) linking to the results page.
  const results = c.shareResults ? await creatorResults(c.id) : null;
  const self = me?.id === c.userId;
  const views = reels.reduce((s, r) => s + r.viewCount, 0);
  const ig = social(c.instagram, "https://instagram.com/");
  const tt = social(c.tiktok, "https://www.tiktok.com/@");
  return (
    <main className="pb-nav">
      {/* Banner (placed by the creator) with a soft curved edge; the top bar sits on it. */}
      <div className="relative aspect-[2/1] max-h-[340px] w-full lg:mx-auto lg:max-w-3xl">
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-200 to-brand-400 [clip-path:ellipse(135%_100%_at_50%_0%)] lg:rounded-t-3xl" data-testid="creator-banner">
          {c.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />
        </div>
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
          <BackButton fallback="/explore" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/95 text-ink shadow-md active:scale-90" />
          <span className="min-w-0 flex-1 truncate text-lg font-extrabold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]" dir="ltr" data-testid="creator-topbar-handle">
            @{c.handle}
          </span>
          <ShareButton title={`${c.displayName} (@${c.handle})`} message={t("{name} on numnum: food reels and favorite spots", { name: c.displayName })} path={`/c/${c.handle}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/95 text-ink shadow-md active:scale-90">
            <Share className="h-5 w-5" />
          </ShareButton>
          {/* Visitors only need Share; the creator's own "…" has Edit profile and Followers. */}
          {self && <CreatorMoreMenu handle={c.handle} self />}
        </div>
      </div>
      <div className="container-app max-w-3xl pb-5">
        <section className="flex flex-col items-center text-center" data-testid="creator-profile">
          <span className="relative z-10 -mt-16 grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500 ring-4 ring-white shadow-md">
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-12 w-12" />
            )}
          </span>
          <h1 className="mt-3 flex items-center gap-1.5 text-[28px] font-black leading-tight tracking-tight">
            {c.displayName}
            {c.verification === "APPROVED" && <BadgeCheck className="h-6 w-6 text-sky-500" aria-label={t("Verified")} data-testid="creator-verified" />}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[15px] text-ink-muted">
            <span dir="ltr">@{c.handle}</span>
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[12px] font-extrabold uppercase tracking-wide text-brand-600">{t("Food creator")}</span>
          </div>
          {c.bio && <p className="mt-3 max-w-md whitespace-pre-line text-[15px]">{c.bio}</p>}
          {(c.area || ig || tt) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[15px] text-ink-soft">
              {[
                c.area && (
                  <span key="area" className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {c.area}
                  </span>
                ),
                ig && (
                  <a key="ig" href={ig} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 font-semibold text-brand-600">
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                ),
                tt && (
                  <a key="tt" href={tt} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 font-semibold text-brand-600">
                    <Music2 className="h-4 w-4" /> TikTok
                  </a>
                ),
              ]
                .filter(Boolean)
                .flatMap((el, i) => (i ? [<span key={`sep${i}`} className="h-4 w-px bg-black/15" aria-hidden />, el] : [el]))}
            </div>
          )}
          {results && (
            <Link href={`/c/${c.handle}/results`} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100 active:scale-95" data-testid="results-badge">
              📈 {t(results.totals.completedOrders === 1 ? "1 order from their reels" : "{n} orders from their reels", { n: compactNumber(results.totals.completedOrders) })} · {t("See results")} ›
            </Link>
          )}
          <CreatorStats creatorId={c.id} handle={c.handle} initialFollowing={!!follow} initialCount={c.followerCount} loggedIn={!!me} self={self} reels={reels.length} views={views} />
        </section>
        <CreatorProfileTabs
          handle={c.handle}
          self={self}
          reels={reels.map((r) => ({ id: r.id, posterUrl: r.posterUrl, viewCount: r.viewCount, pinned: !!r.pinnedAt, label: r.menuItem.name }))}
          favorites={favorites.map((r) => ({ id: r.id, posterUrl: r.posterUrl, viewCount: r.viewCount, label: r.menuItem.name }))}
        />
      </div>
    </main>
  );
}
