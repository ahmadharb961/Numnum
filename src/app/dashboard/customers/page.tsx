import type { Metadata } from "next";
import Link from "@/components/link";
import { Download, Phone, Search, Users } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { CUSTOMERS_PAGE, listRestaurantCustomers } from "@/server/restaurant-customers";
import { DashPage } from "@/components/dashboard/page";
import { EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Customers") };
}

/** Everyone who ordered from the restaurant: name, mobile, address and how many orders, with a CSV download. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const [t, lang, ctx, sp] = await Promise.all([getT(), getLocale(), requireRestaurant("MANAGER"), searchParams]);
  const r = ctx.restaurant;
  const q = sp.q?.trim() || undefined;
  const { customers, total, page } = await listRestaurantCustomers(r.id, q, Number(sp.page) || 1);
  const pages = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE));
  const href = (p: number) => `/dashboard/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;
  return (
    <DashPage
      title={t("Customers")}
      description={t("Everyone who ordered from you (completed orders), with their latest name, mobile and address.")}
      actions={
        // A plain link: the browser downloads the file.
        <a href="/api/dashboard/customers" download className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white" data-testid="customers-csv">
          <Download className="h-4 w-4" /> {t("Download CSV")}
        </a>
      }
    >
      <form className="mb-4 flex gap-2" action="/dashboard/customers">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input name="q" defaultValue={q} className="input ps-9" placeholder={t("Search by name or mobile")} />
        </div>
        <button className="chip h-11 shrink-0 px-4">{t("Search")}</button>
      </form>
      <p className="mb-2 text-sm text-ink-muted" data-testid="customers-total">
        {t(total === 1 ? "1 customer" : "{n} customers", { n: total })}
      </p>
      {customers.length ? (
        <div className="card overflow-x-auto">
          <table className="table-app" data-testid="customers-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Mobile")}</th>
                <th>{t("Address")}</th>
                <th className="text-end">{t("Orders")}</th>
                <th className="text-end">{t("Total")}</th>
                <th>{t("Last order")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.phone} data-testid="customer-row">
                  <td className="font-semibold">{c.name}</td>
                  <td>
                    <a href={`tel:+${c.phone}`} className="inline-flex items-center gap-1 whitespace-nowrap text-brand-600" dir="ltr">
                      <Phone className="h-3.5 w-3.5" /> {formatPhone(c.phone) || c.phone}
                    </a>
                  </td>
                  <td className="max-w-[260px] text-sm">
                    {c.address ? (
                      <>
                        <div className="truncate">{c.address}</div>
                        {c.area && <div className="text-xs text-ink-muted">{c.area}</div>}
                      </>
                    ) : (
                      <span className="text-ink-muted">{t("Pickup only")}</span>
                    )}
                  </td>
                  <td className="tabular text-end font-bold">{c.orders}</td>
                  <td className="tabular text-end">{formatMoney(c.spentCents, r.currency)}</td>
                  <td className="whitespace-nowrap text-sm">{formatDate(c.lastAt, undefined, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Users />} title={q ? t("No customer matches “{q}”", { q }) : t("No customers yet")} body={q ? undefined : t("Customers appear here after their first completed order.")} />
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={href(page - 1)} className="chip">{t("Previous")}</Link>}
          <span className="text-ink-muted">{t("Page {n} of {m}", { n: page, m: pages })}</span>
          {page < pages && <Link href={href(page + 1)} className="chip">{t("Next")}</Link>}
        </div>
      )}
    </DashPage>
  );
}
