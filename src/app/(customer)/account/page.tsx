import Link from "next/link";
import { Bookmark, ChevronRight, LayoutDashboard, MapPin, Receipt, Shield } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/customer/page-header";
import { AccountForm } from "@/components/customer/account-form";
import { NotifyPrompt } from "@/components/customer/notify-prompt";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatPhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";
import { STATUS_META, ACTIVE_STATUSES } from "@/lib/order-status";

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [active, orderCount, addressCount, staffCount] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.customerAddress.count({ where: { userId: user.id } }),
    prisma.restaurantStaff.count({ where: { userId: user.id } }),
  ]);
  const workLinks = [
    ...(staffCount ? [{ href: "/dashboard", icon: LayoutDashboard, label: "Restaurant dashboard", sub: "Orders, menu, reels, insights" }] : []),
    ...(user.roles.includes("ADMIN") ? [{ href: "/admin", icon: Shield, label: "Admin panel", sub: "Restaurants, payments, settings" }] : []),
  ];
  return (
    <main className="pb-nav">
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} back={false} />
      <div className="container-app space-y-5 pt-4">
        {active.map((o) => (
          <Link key={o.id} href={`/order/${o.reference}`} className="card flex items-center gap-3 p-4">
            <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{o.restaurantName}</div>
              <div className="text-xs text-ink-muted">{STATUS_META[o.status].customer}</div>
            </div>
            <span className="tabular text-sm font-semibold">{formatMoney(o.totalCents, o.currency)}</span>
          </Link>
        ))}
        <NotifyPrompt />
        <nav className="card divide-y divide-black/5">
          {[
            ...workLinks,
            { href: "/account/orders", icon: Receipt, label: "My orders", sub: `${orderCount} order${orderCount === 1 ? "" : "s"}` },
            { href: "/account/addresses", icon: MapPin, label: "Saved addresses", sub: `${addressCount} saved` },
            { href: "/saved", icon: Bookmark, label: "Saved dishes & restaurants", sub: "Reels, dishes, restaurants" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <l.icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{l.label}</span>
                <span className="block text-xs text-ink-muted">{l.sub}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-ink-muted" />
            </Link>
          ))}
        </nav>
        <section>
          <h2 className="mb-2 font-extrabold">Profile</h2>
          <AccountForm name={user.name} phone={user.phone ? formatPhone(user.phone) : ""} email={user.email} />
        </section>
        <form action={logoutAction}>
          <Button variant="outline" block type="submit">
            Log out
          </Button>
        </form>
        <p className="pb-2 text-center text-xs text-ink-muted">
          <Badge>Cash on delivery</Badge> is the only payment method — no card details are ever stored.
        </p>
      </div>
    </main>
  );
}
