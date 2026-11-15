import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { liveDeals } from "@/server/deals";
import { PageHeader } from "@/components/customer/page-header";
import { FollowingList } from "@/components/customer/following-list";
import { dealText } from "@/lib/deals";
import { placeLabel } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Following"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

/** The restaurants the customer follows (Account → Following), newest first. */
export default async function FollowingPage() {
  const t = await getT();
  const user = await requireUser("/account/following");
  const follows = await prisma.restaurantFollow.findMany({
    // Restaurants they blocked stay hidden here too.
    where: { userId: user.id, restaurant: { status: "ACTIVE", blockedBy: { none: { userId: user.id } } } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { restaurant: { select: { id: true, slug: true, displayName: true, logoUrl: true, area: true, city: true, cuisine: true, currency: true, verificationStatus: true, followerCount: true } } },
  });
  const deals = await liveDeals(follows.map((f) => f.restaurant.id), { cached: true });
  const items = follows.map(({ restaurant: r }) => {
    const d = deals.get(r.id)?.[0];
    const label = d ? dealText(d, r.currency, null) : null;
    return { id: r.id, slug: r.slug, name: r.displayName, logoUrl: r.logoUrl, place: [placeLabel(r.area, r.city), r.cuisine].filter(Boolean).join(" · "), verified: r.verificationStatus === "APPROVED", followerCount: r.followerCount, deal: label ? t(label.k, label.v) : null };
  });
  return (
    <main className="pb-nav">
      <PageHeader title={t("Following")} sub={items.length ? t(items.length === 1 ? "{n} restaurant" : "{n} restaurants", { n: items.length }) : undefined} />
      <div className="container-app pt-4">
        <FollowingList items={items} />
      </div>
    </main>
  );
}
