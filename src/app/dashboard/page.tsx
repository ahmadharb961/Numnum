import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Eye, Heart, Send } from "lucide-react";
import { requireRestaurant, canAccess } from "@/server/auth";
import { restaurantOverview } from "@/server/analytics";
import { onboardingChecklist } from "@/server/restaurants";
import { DashPage, Section } from "@/components/dashboard/page";
import { StatCard, Alert, Badge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Overview") };
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string; days?: string }> }) {
  const t = await getT();
  const ctx = await requireRestaurant();
  const r = ctx.restaurant;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const [o, steps] = await Promise.all([restaurantOverview(r.id, days), onboardingChecklist(r.id)]);
  const done = steps.filter((s) => s.done).length;
  const owner = canAccess(ctx.staffRole, "OWNER");

  return (
    <DashPage
      title={t("Hi, {name}", { name: ctx.user.name.split(" ")[0] })}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {r.displayName}
          <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "PENDING_APPROVAL" ? "amber" : r.status === "SUSPENDED" ? "red" : "gray"}>{t(r.status === "PENDING_APPROVAL" ? "Pending approval" : r.status.toLowerCase())}</Badge>
          {r.verificationStatus === "APPROVED" && <Badge tone="blue">{t("Verified")}</Badge>}
        </span>
      }
      actions={
        <div className="flex rounded-xl bg-black/5 p-1 text-xs font-semibold">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/dashboard?days=${d}`} className={`rounded-lg px-3 py-1.5 ${d === days ? "bg-white shadow-sm" : "text-ink-muted"}`}>
              {t("{n} days", { n: d })}
            </Link>
          ))}
        </div>
      }
    >
      {sp.welcome && <Alert tone="green" className="mb-5">{t("Welcome to numnum! Follow the steps below to start receiving orders.")}</Alert>}
      {done < steps.length && (
        <Section title={t("Get set up")} description={t("{done} of {total} done", { done, total: steps.length })}>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ol className="grid gap-1 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-black/[0.03]">
                  {s.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-ink-muted/40" />}
                  <span className={s.done ? "text-ink-muted line-through" : "font-semibold"}>
                    {i + 1}. {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">{t("Engagement (all time)")}</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reel views" value={compactNumber(o.totals.reelViews)} sub="qualified views" />
        <StatCard label="Likes" value={compactNumber(o.totals.likes)} />
        <StatCard label="Shares" value={compactNumber(o.totals.shares)} />
        <StatCard label="Menu item views" value={compactNumber(o.totals.itemViews)} />
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">{t("Orders (last {n} days)", { n: days })}</h2>
      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders received" value={o.period.placed} sub={t("{completed} completed · {rejected} rejected · {canceled} canceled", { completed: o.period.completed, rejected: o.period.rejected, canceled: o.period.canceled })} />
        <StatCard label="Cash sales (completed)" value={formatMoney(o.period.salesCents, o.rating.currency)} tone="green" />
        <StatCard label="Avg. time to accept" value={o.period.avgAcceptMinutes != null ? t("{n} min", { n: Math.round(o.period.avgAcceptMinutes) }) : "—"} sub={o.period.failed ? t("{n} not delivered", { n: o.period.failed }) : "Faster acceptance = happier customers"} />
        {owner ? <StatCard label="Estimated commission" value={formatMoney(o.period.commissionCents)} tone="brand" sub={<Link href="/dashboard/billing" className="text-brand-600">{t("Billing →")}</Link>} /> : <StatCard label="Rating" value={o.rating.ratingCount ? o.rating.ratingAvg.toFixed(1) : "—"} />}
      </div>
      <p className="mb-5 text-xs text-ink-muted">{t("Commission applies to completed orders only. Rejected and canceled orders are never charged.")}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("Top dishes")} description={t("By quantity in completed orders, last {n} days", { n: days })}>
          {o.topItems.length ? (
            <ol className="space-y-2 text-sm">
              {o.topItems.map((t, i) => (
                <li key={t.menuItemId ?? i} className="flex justify-between">
                  <span>
                    <span className="me-2 text-ink-muted">{i + 1}.</span>
                    {t.name}
                  </span>
                  <span className="tabular font-semibold">{t._sum.quantity} sold</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">{t("No completed orders yet.")}</p>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-ink-muted">{t("Restaurant rating:")}</span>
            <b>{o.rating.ratingCount ? `${o.rating.ratingAvg.toFixed(1)} ★ (${o.rating.ratingCount})` : t("No reviews yet")}</b>
          </div>
        </Section>
        <Section title={t("Top reels")}>
          {o.topReels.length ? (
            <ul className="space-y-2">
              {o.topReels.map((rl) => (
                <li key={rl.id}>
                  <Link href={`/dashboard/reels/${rl.id}`} className="flex items-center gap-3 text-sm">
                    <div className="h-14 w-9 shrink-0 overflow-hidden rounded bg-black">
                      {rl.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rl.posterUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="flex-1 truncate font-semibold">{rl.menuItem.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Eye className="h-3.5 w-3.5" />
                      {compactNumber(rl.viewCount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Heart className="h-3.5 w-3.5" />
                      {compactNumber(rl.likeCount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Send className="h-3.5 w-3.5" />
                      {compactNumber(rl.orderInits)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              {t("No published reels yet.")} <Link href="/dashboard/reels/new" className="font-semibold text-brand-600">{t("Upload one")}</Link>
            </p>
          )}
        </Section>
      </div>
    </DashPage>
  );
}
