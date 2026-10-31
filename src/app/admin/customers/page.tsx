import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { CustomerCreateForm } from "@/components/admin/customer-create-form";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const where = { roles: { some: { role: "CUSTOMER" as const } }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } : {}) };
  const [list, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, email: true, phone: true, createdAt: true, lastLoginAt: true, disabled: true, _count: { select: { orders: true } } } }),
    prisma.user.count({ where }),
  ]);
  return (
    <DashPage title="Customers" description={`${total} customer account${total === 1 ? "" : "s"}`}>
      <div className="space-y-5">
        <CustomerCreateForm />
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="input h-10 max-w-sm text-sm" placeholder="Search name, email or phone" />
        </form>
        <div className="card overflow-x-auto">
          <table className="table-app">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Joined</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.disabled ? "opacity-50" : ""}>
                  <td className="font-semibold">{u.name}</td>
                  <td>{u.email}</td>
                  <td className="whitespace-nowrap">{u.phone ? formatPhone(u.phone) : "—"}</td>
                  <td>{u._count.orders}</td>
                  <td className="whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="whitespace-nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashPage>
  );
}
