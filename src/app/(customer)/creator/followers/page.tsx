import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { followerName } from "@/server/creators";
import { PageHeader } from "@/components/customer/page-header";
import { EmptyState } from "@/components/ui/misc";
import { cn, compactNumber, formatDate } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Followers"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

const SHOW = 500;

/** Who follows the creator, newest first (only the creator sees this). */
export default async function CreatorFollowersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const [t, lang, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const me = await requireUser("/creator/followers");
  const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { id: true, status: true, followerCount: true } });
  if (!c || c.status === "PENDING" || c.status === "DECLINED") redirect("/creator/apply");
  const rows = await prisma.creatorFollow.findMany({
    where: { creatorId: c.id },
    orderBy: { createdAt: "desc" },
    take: SHOW,
    select: { createdAt: true, user: { select: { id: true, name: true } } },
  });
  const week = Date.now() - 7 * 86400_000;
  const newThisWeek = rows.filter((r) => r.createdAt.getTime() > week).length;
  return (
    <div className="pb-nav">
      <PageHeader title="Followers" sub={t(c.followerCount === 1 ? "{n} follower" : "{n} followers", { n: compactNumber(c.followerCount) })} />
      <div className="container-app max-w-xl py-5">
        {rows.length ? (
          <>
            {newThisWeek > 0 && <p className="mb-3 text-sm font-semibold text-emerald-700">{t("{n} new this week", { n: newThisWeek })}</p>}
            <ul className="card divide-y divide-black/5 overflow-hidden" data-testid="followers">
              {rows.map((r) => {
                const name = followerName(r.user.name);
                return (
                  <li key={r.user.id} className={cn("flex items-center gap-3 p-3.5", sp.f === r.user.id && "bg-brand-50/60")} data-testid="follower">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-base font-black text-white" aria-hidden>
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" dir="auto">{name}</span>
                      <span className="block text-xs text-ink-muted">{t("Followed you on {date}", { date: formatDate(r.createdAt, { dateStyle: "medium" }, lang) })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {c.followerCount > SHOW && <p className="mt-3 text-center text-xs text-ink-muted">{t("Showing your {n} newest followers.", { n: SHOW })}</p>}
          </>
        ) : (
          <EmptyState icon={<Users />} title={t("No followers yet")} body={t("Post reels people love: they tap Follow on your profile or on your reels.")} />
        )}
      </div>
    </div>
  );
}
