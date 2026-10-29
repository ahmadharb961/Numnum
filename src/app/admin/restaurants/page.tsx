import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { Badge } from "@/components/ui/misc";
import { cn, compactNumber, formatDate } from "@/lib/utils";

export const metadata = { title: "Restaurants" };

const FILTERS: Record<string, Prisma.RestaurantWhereInput> = {
  all: {},
  pending: { status: "PENDING_APPROVAL" },
  active: { status: "ACTIVE" },
  draft: { status: "DRAFT" },
  suspended: { status: "SUSPENDED" },
  verified: { verificationStatus: "APPROVED" },
};

export default async function AdminRestaurants({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const f = sp.f && sp.f in FILTERS ? sp.f : "all";
  const list = await prisma.restaurant.findMany({
    where: { ...FILTERS[f], ...(sp.q ? { OR: [{ displayName: { contains: sp.q, mode: "insensitive" } }, { businessName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { menuItems: { where: { archived: false } }, reels: true, orders: true } } },
  });
  return (
    <DashPage title="Restaurants">
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={sp.q} className="input h-10 max-w-sm text-sm" placeholder="Search name or email" />
        <input type="hidden" name="f" value={f} />
      </form>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {Object.keys(FILTERS).map((k) => (
          <Link key={k} href={`/admin/restaurants?f=${k}`} className={cn("chip h-9 text-xs capitalize", f === k && "chip-active")}>
            {k}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-app">
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Status</th>
              <th>Verification</th>
              <th>Items</th>
              <th>Reels</th>
              <th>Orders</th>
              <th>Views</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/restaurants/${r.id}`} className="font-semibold text-brand-600">
                    {r.displayName}
                  </Link>
                  <div className="text-xs text-ink-muted">{r.area ?? r.city ?? ""}</div>
                </td>
                <td>
                  <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "PENDING_APPROVAL" ? "amber" : r.status === "SUSPENDED" ? "red" : "gray"}>{r.status.toLowerCase().replace("_", " ")}</Badge>
                </td>
                <td>
                  <Badge tone={r.verificationStatus === "APPROVED" ? "blue" : r.verificationStatus === "PENDING" ? "amber" : "gray"}>{r.verificationStatus.toLowerCase().replace("_", " ")}</Badge>
                </td>
                <td>{r._count.menuItems}</td>
                <td>{r._count.reels}</td>
                <td>{r._count.orders}</td>
                <td>{compactNumber(r.totalReelViews)}</td>
                <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashPage>
  );
}
