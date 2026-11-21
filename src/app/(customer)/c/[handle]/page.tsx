import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, Instagram, MapPin, Music2, Share, UserRound } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { publicReelWhere } from "@/server/feed";
import { creatorFavorites, creatorGridOrder, handleRedirect } from "@/server/creators";
import { PageHeader } from "@/components/customer/page-header";
import { CreatorStats } from "@/components/creator/follow-creator";
import { CreatorMoreMenu, CreatorProfileTabs } from "@/components/creator/creator-profile-tabs";
import { ShareButton } from "@/components/customer/restaurant-profile";
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
  const self = me?.id === c.userId;
  const views = reels.reduce((s, r) => s + r.viewCount, 0);
  const ig = social(c.instagram, "https://instagram.com/");
  const tt = social(c.tiktok, "https://www.tiktok.com/@");
  return (
    <main className="pb-nav">
      <PageHeader
        title={`@${c.handle}`}
        right={
          <div className="flex items-center gap-2">
            <ShareButton title={`${c.displayName} (@${c.handle})`} message={t("{name} on numnum: food reels and favorite spots", { name: c.displayName })} path={`/c/${c.handle}`} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md active:scale-90">
              <Share className="h-5 w-5" />
            </ShareButton>
            <CreatorMoreMenu handle={c.handle} self={self} />
          </div>
        }
      />
      <div className="container-app max-w-3xl py-5">
        <section className="flex flex-col items-center text-center" data-testid="creator-profile">
          <span className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500 ring-4 ring-white shadow-md">
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
