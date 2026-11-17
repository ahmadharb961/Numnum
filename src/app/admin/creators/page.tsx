import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { BadgeCheck, ExternalLink, UserRound } from "lucide-react";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/misc";
import { decideCreatorAction, decideVerificationAction, suspendCreatorAction } from "@/actions/creators";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Creators" };

const TABS = [
  { key: "applications", label: "Applications", where: { status: "PENDING" } },
  { key: "verification", label: "Verification", where: { status: "APPROVED", verification: "PENDING" } },
  { key: "approved", label: "Approved", where: { status: "APPROVED" } },
  { key: "suspended", label: "Suspended", where: { status: "SUSPENDED" } },
  { key: "declined", label: "Declined", where: { status: "DECLINED" } },
] as const satisfies readonly { key: string; label: string; where: Prisma.CreatorWhereInput }[];

const social = (v: string | null, base: string) => (!v ? null : /^https?:\/\//.test(v) ? v : `${base}${v.replace(/^@/, "")}`);

export default async function AdminCreatorsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((x) => x.key === tabParam) ?? TABS[0];
  const [list, counts] = await Promise.all([
    prisma.creator.findMany({
      where: tab.where,
      orderBy: tab.key === "verification" ? { verificationRequestedAt: "asc" } : tab.key === "applications" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, phone: true } }, _count: { select: { reels: { where: { tagStatus: "ACCEPTED" } } } } },
    }),
    Promise.all(TABS.map((x) => prisma.creator.count({ where: x.where }))),
  ]);
  return (
    <DashPage title="Food creators" description="Bloggers who post reels tagging restaurants' dishes. Approve applications, verification requests, and suspend creators who break the rules (their reels leave the feed at once).">
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((x, i) => (
          <Link key={x.key} href={`/admin/creators?tab=${x.key}`} className={cn("chip h-9 text-sm", x.key === tab.key && "chip-active")}>
            {x.label} <span className="ms-1 text-xs opacity-70">{counts[i]}</span>
          </Link>
        ))}
      </div>
      {!list.length && (
        <div className="card">
          <EmptyState title={tab.key === "applications" ? "No applications waiting" : tab.key === "verification" ? "No verification requests" : "Nobody here yet"} />
        </div>
      )}
      <div className="space-y-4">
        {list.map((c) => {
          const ig = social(c.instagram, "https://instagram.com/");
          const tt = social(c.tiktok, "https://www.tiktok.com/@");
          return (
            <div key={c.id} className="card p-5" data-testid="admin-creator">
              <div className="flex flex-wrap items-start gap-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-7 w-7" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{c.displayName}</span>
                    {c.verification === "APPROVED" && <BadgeCheck className="h-5 w-5 text-sky-500" />}
                    {c.status === "APPROVED" ? (
                      <Link href={`/c/${c.handle}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                        @{c.handle} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-ink-muted">@{c.handle}</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {c.user.email}
                    {c.user.phone ? ` · ${c.user.phone}` : ""} · applied {formatDateTime(c.createdAt)}
                    {c.area ? ` · ${c.area}` : ""}
                  </div>
                  {c.bio && <p className="mt-2 text-sm">{c.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {c.audienceSize != null && <span className="chip h-8">{c.audienceSize.toLocaleString("en-US")} followers elsewhere</span>}
                    {ig && (
                      <a href={ig} target="_blank" rel="noopener" className="chip h-8">
                        Instagram <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {tt && (
                      <a href={tt} target="_blank" rel="noopener" className="chip h-8">
                        TikTok <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {c.status === "APPROVED" && (
                      <span className="chip h-8">
                        {c._count.reels} live reels · {c.followerCount} followers on numnum
                      </span>
                    )}
                  </div>
                  {tab.key === "verification" && c.verificationNote && <p className="mt-2 rounded-xl bg-cream p-3 text-sm">“{c.verificationNote}”</p>}
                  {c.decisionNote && tab.key !== "applications" && <p className="mt-2 text-xs text-ink-muted">Note: {c.decisionNote}</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.status === "PENDING" && (
                  <>
                    <ActionButton variant="primary" action={decideCreatorAction.bind(null, c.id, true)} confirm={`Approve @${c.handle}? They'll get the welcome email.`}>
                      Approve
                    </ActionButton>
                    <ActionButton variant="danger" action={decideCreatorAction.bind(null, c.id, false)} prompt="Reason (sent to them)">
                      Decline
                    </ActionButton>
                  </>
                )}
                {tab.key === "verification" && (
                  <>
                    <ActionButton variant="primary" action={decideVerificationAction.bind(null, c.id, true)} confirm={`Give @${c.handle} the verified badge?`}>
                      Verify
                    </ActionButton>
                    <ActionButton action={decideVerificationAction.bind(null, c.id, false)} prompt="Reason (sent to them)">
                      Decline verification
                    </ActionButton>
                  </>
                )}
                {c.status === "APPROVED" && (
                  <ActionButton variant="danger" action={suspendCreatorAction.bind(null, c.id, true)} prompt="Reason for suspending (sent to them)">
                    Suspend
                  </ActionButton>
                )}
                {c.status === "SUSPENDED" && (
                  <ActionButton action={suspendCreatorAction.bind(null, c.id, false)} confirm={`Restore @${c.handle}? Their reels return to the feed.`}>
                    Restore
                  </ActionButton>
                )}
                {c.status === "DECLINED" && (
                  <ActionButton action={decideCreatorAction.bind(null, c.id, true)} confirm={`Approve @${c.handle} after all?`}>
                    Approve
                  </ActionButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DashPage>
  );
}
