import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, Instagram, MapPin, Music2, Pin, UserRound } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { publicReelWhere } from "@/server/feed";
import { creatorGridOrder, handleRedirect } from "@/server/creators";
import { PageHeader } from "@/components/customer/page-header";
import { ReelThumb } from "@/components/customer/cards";
import { FollowCreatorButton } from "@/components/creator/follow-creator";
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

/** A food creator's public profile: who they are, pinned reels first, then their newest. */
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
  const [reels, follow] = await Promise.all([
    prisma.reel.findMany({ where: { ...publicReelWhere, creatorId: c.id }, orderBy: creatorGridOrder, select: { id: true, posterUrl: true, viewCount: true, pinnedAt: true, menuItem: { select: { name: true } } } }),
    me ? prisma.creatorFollow.findUnique({ where: { userId_creatorId: { userId: me.id, creatorId: c.id } } }) : null,
  ]);
  const views = reels.reduce((s, r) => s + r.viewCount, 0);
  const ig = social(c.instagram, "https://instagram.com/");
  const tt = social(c.tiktok, "https://www.tiktok.com/@");
  return (
    <main className="pb-nav">
      <PageHeader title={`@${c.handle}`} />
      <div className="container-app max-w-3xl py-5">
        <section className="flex flex-col items-center text-center" data-testid="creator-profile">
          <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500 ring-4 ring-white shadow-md">
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-10 w-10" />
            )}
          </span>
          <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-black tracking-tight">
            {c.displayName}
            {c.verification === "APPROVED" && <BadgeCheck className="h-6 w-6 text-sky-500" aria-label={t("Verified")} data-testid="creator-verified" />}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-ink-muted">
            <span dir="ltr">@{c.handle}</span>
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">{t("Food creator")}</span>
          </div>
          {c.bio && <p className="mt-3 max-w-md whitespace-pre-line text-[15px]">{c.bio}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm text-ink-soft">
            {c.area && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {c.area}
              </span>
            )}
            {ig && (
              <a href={ig} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 font-semibold text-brand-600">
                <Instagram className="h-4 w-4" /> Instagram
              </a>
            )}
            {tt && (
              <a href={tt} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 font-semibold text-brand-600">
                <Music2 className="h-4 w-4" /> TikTok
              </a>
            )}
          </div>
          <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white py-3 shadow-sm">
              <div className="text-2xl font-black tabular">{reels.length}</div>
              <div className="text-xs text-ink-muted">{t("reels")}</div>
            </div>
            <div className="rounded-2xl bg-white py-3 shadow-sm">
              <div className="text-2xl font-black tabular">{compactNumber(views)}</div>
              <div className="text-xs text-ink-muted">{t("reel views")}</div>
            </div>
          </div>
          <div className="mt-4">
            <FollowCreatorButton creatorId={c.id} handle={c.handle} initialFollowing={!!follow} initialCount={c.followerCount} loggedIn={!!me} self={me?.id === c.userId} />
          </div>
        </section>
        {reels.length ? (
          <div className="mt-6 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl" data-testid="creator-grid">
            {reels.map((r) => (
              <div key={r.id} className="relative" data-pinned={r.pinnedAt ? "true" : undefined}>
                <ReelThumb href={`/c/${c.handle}/reels/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.menuItem.name} />
                {r.pinnedAt && (
                  <span className="pointer-events-none absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    <Pin className="h-3 w-3" /> {t("Pinned")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-ink-muted">{t("No reels yet.")}</p>
        )}
      </div>
    </main>
  );
}
