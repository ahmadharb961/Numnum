import Link from "next/link";
import { CheckCircle2, Circle, Eye, Heart, Send } from "lucide-react";
import { requireRestaurant, canAccess } from "@/server/auth";
import { restaurantOverview } from "@/server/analytics";
import { onboardingChecklist } from "@/server/restaurants";
import { DashPage, Section } from "@/components/dashboard/page";
import { StatCard, Alert, Badge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { compactNumber } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string; days?: string }> }) {
  const ctx = await requireRestaurant();
  const r = ctx.restaurant;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const [o, steps] = await Promise.all([restaurantOverview(r.id, days), onboardingChecklist(r.id)]);
  const done = steps.filter((s) => s.done).length;
  const owner = canAccess(ctx.staffRole, "OWNER");

  return (
    <DashPage
      title={`Hi, ${ctx.user.name.split(" ")[0]}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {r.displayName}
          <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "PENDING_APPROVAL" ? "amber" : r.status === "SUSPENDED" ? "red" : "gray"}>{r.status === "PENDING_APPROVAL" ? "Pending approval" : r.status.toLowerCase()}</Badge>
          {r.verificationStatus === "APPROVED" && <Badge tone="blue">Verified</Badge>}
        </span>
      }
      actions={
        <div className="flex rounded-xl bg-black/5 p-1 text-xs font-semibold">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/dashboard?days=${d}`} className={`rounded-lg px-3 py-1.5 ${d === days ? "bg-white shadow-sm" : "text-ink-muted"}`}>
              {d} days
            </Link>
          ))}
        </div>
      }
    >
      {sp.welcome && <Alert tone="green" className="mb-5">Welcome to numnum! Follow the steps below to start receiving orders.</Alert>}
      {done < steps.length && (
        <Section title="Get set up" description={`${done} of ${steps.length} done`}>
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

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Engagement (all time)</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reel views" value={compactNumber(o.totals.reelViews)} sub="qualified views" />
        <StatCard label="Likes" value={compactNumber(o.totals.likes)} />
        <StatCard label="Shares" value={compactNumber(o.totals.shares)} />
        <StatCard label="Menu item views" value={compactNumber(o.totals.itemViews)} />
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Orders (last {days} days)</h2>
      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders received" value={o.period.placed} sub={`${o.period.completed} completed · ${o.period.rejected} rejected · ${o.period.canceled} canceled`} />
        <StatCard label="Cash sales (completed)" value={formatMoney(o.period.salesCents, o.rating.currency)} tone="green" />
        <StatCard label="Avg. time to accept" value={o.period.avgAcceptMinutes != null ? `${Math.round(o.period.avgAcceptMinutes)} min` : "—"} sub={o.period.failed ? `${o.period.failed} not delivered` : "Faster acceptance = happier customers"} />
        {owner ? <StatCard label="Estimated commission" value={formatMoney(o.period.commissionCents)} tone="brand" sub={<Link href="/dashboard/billing" className="text-brand-600">Billing →</Link>} /> : <StatCard label="Rating" value={o.rating.ratingCount ? o.rating.ratingAvg.toFixed(1) : "—"} />}
      </div>
      <p className="mb-5 text-xs text-ink-muted">Commission applies to completed orders only. Rejected and canceled orders are never charged.</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Top dishes" description={`By quantity in completed orders, last ${days} days`}>
          {o.topItems.length ? (
            <ol className="space-y-2 text-sm">
              {o.topItems.map((t, i) => (
                <li key={t.menuItemId ?? i} className="flex justify-between">
                  <span>
                    <span className="mr-2 text-ink-muted">{i + 1}.</span>
                    {t.name}
                  </span>
                  <span className="tabular font-semibold">{t._sum.quantity} sold</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">No completed orders yet.</p>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Restaurant rating:</span>
            <b>{o.rating.ratingCount ? `${o.rating.ratingAvg.toFixed(1)} ★ (${o.rating.ratingCount})` : "No reviews yet"}</b>
          </div>
        </Section>
        <Section title="Top reels">
          {o.topReels.length ? (
            <ul className="space-y-2">
              {o.topReels.map((t) => (
                <li key={t.id}>
                  <Link href={`/dashboard/reels/${t.id}`} className="flex items-center gap-3 text-sm">
                    <div className="h-14 w-9 shrink-0 overflow-hidden rounded bg-black">
                      {t.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.posterUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="flex-1 truncate font-semibold">{t.menuItem.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Eye className="h-3.5 w-3.5" />
                      {compactNumber(t.viewCount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Heart className="h-3.5 w-3.5" />
                      {compactNumber(t.likeCount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Send className="h-3.5 w-3.5" />
                      {compactNumber(t.orderInits)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              No published reels yet. <Link href="/dashboard/reels/new" className="font-semibold text-brand-600">Upload one</Link>
            </p>
          )}
        </Section>
      </div>
    </DashPage>
  );
}
