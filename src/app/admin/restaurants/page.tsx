import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { RestaurantTable } from "@/components/admin/restaurant-table";
import { getSettings } from "@/server/settings";
import { cn, compactNumber, formatDate } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Restaurants" };

const FILTERS: Record<string, Prisma.RestaurantWhereInput> = {
  all: {},
  pending: { status: "PENDING_APPROVAL" },
  active: { status: "ACTIVE" },
  draft: { status: "DRAFT" },
  suspended: { status: "SUSPENDED" },
  verified: { verificationStatus: "APPROVED" },
  "custom commission": { commissionRateBps: { not: null } },
};

export default async function AdminRestaurants({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const f = sp.f && sp.f in FILTERS ? sp.f : "all";
  const settings = await getSettings();
  const list = await prisma.restaurant.findMany({
    where: { ...FILTERS[f], ...(sp.q ? { OR: [{ displayName: { contains: sp.q, mode: "insensitive" } }, { businessName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { _count: { select: { menuItems: { where: { archived: false } }, reels: true, orders: true } } },
  });
  return (
    <DashPage
      title="Restaurants"
      description={`Default commission ${settings.defaultCommissionRateBps / 100}% (change it in Settings). Select restaurants to give them their own rate.`}
      actions={
        <Link href="/admin/restaurants/new" className={buttonClass("primary", "md")}>
          + Add restaurant
        </Link>
      }
    >
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={sp.q} className="input h-10 max-w-sm text-sm" placeholder="Search name or email" />
        <input type="hidden" name="f" value={f} />
      </form>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {Object.keys(FILTERS).map((k) => (
          <Link key={k} href={`/admin/restaurants?f=${encodeURIComponent(k)}`} className={cn("chip h-9 text-xs capitalize", f === k && "chip-active")}>
            {k}
          </Link>
        ))}
      </div>
      <RestaurantTable
        defaultRate={settings.defaultCommissionRateBps / 100}
        rows={list.map((r) => ({ id: r.id, displayName: r.displayName, place: r.area ?? r.city ?? "", status: r.status, verificationStatus: r.verificationStatus, commissionRateBps: r.commissionRateBps, items: r._count.menuItems, reels: r._count.reels, orders: r._count.orders, views: compactNumber(r.totalReelViews), joined: formatDate(r.createdAt) }))}
      />
    </DashPage>
  );
}
