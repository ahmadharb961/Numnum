import type { Metadata } from "next";
import Link from "@/components/link";
import { BadgeCheck, Instagram, Music2, Sparkles, UserRound } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { sharingCreators } from "@/server/creator-results";
import { DashPage } from "@/components/dashboard/page";
import { EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Find creators") };
}

const link = (v: string | null, base: string) => (!v ? null : /^https?:\/\//.test(v) ? v : `${base}${v.replace(/^@/, "")}`);

/**
 * Food creators who share their results, best first: the orders their reels really brought
 * (counted by numnum), so the restaurant can choose who to work with, or pay to tag a dish.
 */
export default async function FindCreatorsPage() {
  const [t] = await Promise.all([getT(), requireRestaurant("MANAGER")]);
  const list = await sharingCreators(60);
  return (
    <DashPage title={t("Find creators")} description={t("Food creators who share their results with restaurants: real orders their reels brought, counted by numnum. Contact them to tag your dishes.")}>
      {list.length ? (
        <ul className="grid gap-3 lg:grid-cols-2" data-testid="find-creators">
          {list.map((c, i) => {
            const ig = link(c.instagram, "https://instagram.com/");
            const tt = link(c.tiktok, "https://www.tiktok.com/@");
            return (
              <li key={c.id} className="card p-4" data-testid="find-creator">
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-7 w-7" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 font-extrabold">
                      <span className="truncate">{c.displayName}</span>
                      {c.verification === "APPROVED" && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />}
                      {i < 3 && c.results.completedOrders > 0 && <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("Top creator")} />}
                    </div>
                    <div className="truncate text-sm text-ink-muted" dir="ltr">
                      @{c.handle}
                      {c.area ? ` · ${c.area}` : ""}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-2xl font-black tabular text-emerald-700">{compactNumber(c.results.completedOrders)}</div>
                    <div className="text-[11px] text-ink-muted">{t("orders brought")}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-black/[0.03] p-2 text-center text-xs">
                  <div>
                    <div className="font-black tabular">{compactNumber(c.results.views)}</div>
                    <div className="text-ink-muted">{t("views")}</div>
                  </div>
                  <div>
                    <div className="font-black tabular">{c.results.ordersPer1000Views ?? "–"}</div>
                    <div className="text-ink-muted">{t("orders / 1K views")}</div>
                  </div>
                  <div>
                    <div className="font-black tabular">{c.results.restaurants}</div>
                    <div className="text-ink-muted">{t("restaurants")}</div>
                  </div>
                  <div>
                    <div className="font-black tabular">{formatMoney(c.results.salesUsdCents, "USD")}</div>
                    <div className="text-ink-muted">{t("sales")}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <Link href={`/c/${c.handle}/results`} className="chip h-9 font-bold text-brand-700">{t("See results")}</Link>
                  <Link href={`/c/${c.handle}`} className="chip h-9">{t("Profile")}</Link>
                  {ig && (
                    <a href={ig} target="_blank" rel="noopener nofollow" className="chip h-9">
                      <Instagram className="h-4 w-4" /> Instagram
                    </a>
                  )}
                  {tt && (
                    <a href={tt} target="_blank" rel="noopener nofollow" className="chip h-9">
                      <Music2 className="h-4 w-4" /> TikTok
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Sparkles />} title={t("No creators sharing results yet")} body={t("Creators appear here once they choose to show their results to restaurants.")} />
      )}
    </DashPage>
  );
}
