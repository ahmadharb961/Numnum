import { notFound } from "next/navigation";
import Link from "@/components/link";
import { requireAdmin } from "@/server/auth";
import { getAccount } from "@/server/admin-people";
import { DashPage } from "@/components/dashboard/page";
import { AccountBadges } from "@/components/admin/account-badges";
import { AccountActions } from "@/components/admin/account-actions";
import { Badge } from "@/components/ui/misc";
import { formatPhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Customer" };

/** Admin → Customers → one account: who they are on numnum, their activity, and actions. */
export default async function AdminAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const a = await getAccount((await params).id);
  if (!a) notFound();
  const isAdmin = a.roles.some((r) => r.role === "ADMIN");
  const deleteBlocked = a.id === me.id ? "This is your own account." : a.blocker.ok ? null : a.blocker.reason === "owner" ? `They own ${a.blocker.restaurants?.join(", ")}: close or hand over the restaurant first.` : a.blocker.reason === "admin" ? "Admin accounts can't be deleted." : "They have an order in progress: delete the account once it's finished.";
  const facts: [string, React.ReactNode][] = [
    ["Email", <span key="e">{a.email} {a.emailVerifiedAt ? <Badge tone="green">confirmed</Badge> : null}</span>],
    ["Mobile", a.phone ? formatPhone(a.phone) : "—"],
    ["Language", a.locale === "ar" ? "Arabic" : "English"],
    ["Joined", formatDate(a.createdAt)],
    ["Last login", a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "—"],
    ["Orders", a._count.orders],
    ["Saved addresses", a._count.addresses],
    ["Follows", `${a._count.follows} restaurants · ${a._count.creatorFollows} creators`],
    ["Phones with notifications", a._count.pushSubs],
  ];
  return (
    <DashPage
      title={a.name}
      description={
        <Link href="/admin/customers" className="font-semibold text-brand-600" data-testid="account-back">
          ← All customers
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <section className="card space-y-3 p-5" data-testid="account-profile">
            <AccountBadges a={a} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {a.staff.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-extrabold">Restaurants</h2>
              <ul className="space-y-1 text-sm">
                {a.staff.map((s) => (
                  <li key={s.restaurant.id}>
                    <Link href={`/admin/restaurants/${s.restaurant.id}`} className="font-semibold text-brand-600 hover:underline">
                      {s.restaurant.displayName}
                    </Link>{" "}
                    <span className="text-ink-muted">· {s.role.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {a.creator && (
            <section className="card p-5" data-testid="account-creator">
              <h2 className="mb-2 font-extrabold">Food creator</h2>
              <p className="text-sm">
                <Link href={`/c/${a.creator.handle}`} target="_blank" className="font-semibold text-brand-600 hover:underline">
                  @{a.creator.handle}
                </Link>{" "}
                · {a.creator.displayName} · {a.creator.status.toLowerCase()}
                {a.creator.verification === "APPROVED" ? " · verified" : ""}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {a.creator.followerCount} followers · {a.creator._count.reels} reels ·{" "}
                <Link href="/admin/creators" className="text-brand-600 hover:underline">
                  manage in Creators
                </Link>
              </p>
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-2 font-extrabold">Latest orders</h2>
            {a.orders.length ? (
              <ul className="divide-y divide-black/5 text-sm">
                {a.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/orders?q=${o.reference}`} className="font-mono text-brand-600 hover:underline">
                      {o.reference}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{o.restaurantName}</span>
                    <Badge>{o.status.toLowerCase().replace(/_/g, " ")}</Badge>
                    <span className="tabular">{formatMoney(o.totalCents, o.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No orders yet.</p>
            )}
          </section>
        </div>
        <AccountActions id={a.id} name={a.name} email={a.email} phone={a.phone ? formatPhone(a.phone) : ""} disabled={a.disabled} isAdmin={isAdmin} isSelf={a.id === me.id} deleteBlocked={deleteBlocked} />
      </div>
    </DashPage>
  );
}
