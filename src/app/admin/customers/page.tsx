import Link from "@/components/link";
import { DashPage } from "@/components/dashboard/page";
import { CustomerCreateForm } from "@/components/admin/customer-create-form";
import { AccountBadges } from "@/components/admin/account-badges";
import { ACCOUNT_KINDS, listAccounts, type AccountKind } from "@/server/admin-people";
import { formatPhone } from "@/lib/phone";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

const KIND_LABEL: Record<AccountKind, string> = { customer: "Customers", creator: "Food creators", restaurant: "Restaurants", admin: "Admins", disabled: "Disabled" };

/** Every account, what it is (customer, creator, restaurant, admin), and a tap to its profile. */
export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams;
  const kind = (ACCOUNT_KINDS as readonly string[]).includes(type ?? "") ? (type as AccountKind) : undefined;
  const { list, total, all, counts } = await listAccounts(q, kind);
  const href = (k?: AccountKind) => `/admin/customers?${new URLSearchParams({ ...(k ? { type: k } : {}), ...(q ? { q } : {}) })}`;
  return (
    <DashPage title="Customers" description={`${total} account${total === 1 ? "" : "s"}${kind ? ` · ${KIND_LABEL[kind]}` : ""}`}>
      <div className="space-y-5">
        <CustomerCreateForm />
        <div className="flex flex-wrap gap-2" data-testid="account-filters">
          <Link href={href()} className={cn("chip", !kind && "chip-active")}>
            All · {all}
          </Link>
          {ACCOUNT_KINDS.map((k) => (
            <Link key={k} href={href(k)} className={cn("chip", kind === k && "chip-active")} data-testid={`filter-${k}`}>
              {KIND_LABEL[k]} · {counts[k]}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {kind && <input type="hidden" name="type" value={kind} />}
          <input name="q" defaultValue={q} className="input h-10 max-w-sm" placeholder="Search name, email, phone or @username" />
        </form>
        <div className="card overflow-x-auto">
          <table className="table-app">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Joined</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.disabled ? "opacity-60" : ""} data-testid="account-row">
                  <td className="font-semibold">
                    <Link href={`/admin/customers/${u.id}`} className="text-brand-600 hover:underline" data-testid="account-link">
                      {u.name}
                    </Link>
                  </td>
                  <td>
                    <AccountBadges a={u} />
                  </td>
                  <td>{u.email}</td>
                  <td className="whitespace-nowrap">{u.phone ? formatPhone(u.phone) : "—"}</td>
                  <td>{u._count.orders}</td>
                  <td className="whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="whitespace-nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="p-6 text-center text-sm text-ink-muted">No accounts match.</p>}
        </div>
      </div>
    </DashPage>
  );
}
