import "server-only";
import { prisma } from "./db";
import { getCurrentUser, hasRole } from "./auth";

/** Invoices are visible to the restaurant's owner and to admins only. */
export async function loadInvoiceForViewer(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lines: { orderBy: [{ kind: "desc" }, { orderDate: "asc" }] }, payments: true } });
  if (!inv) return null;
  if (hasRole(user, "ADMIN")) return inv;
  const owner = await prisma.restaurantStaff.findFirst({ where: { userId: user.id, restaurantId: inv.restaurantId, role: "OWNER" } });
  return owner ? inv : null;
}
