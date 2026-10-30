import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { json } from "@/server/http";

/** For logged-in customers: name, phone and saved addresses to prefill checkout. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ user: null, addresses: [] });
  const addresses = await prisma.customerAddress.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  return json({ user: { name: user.name, phone: user.phone }, addresses: addresses.map((a) => ({ id: a.id, label: a.label, area: a.area, address: a.address, building: a.building, notes: a.notes, hasLocation: a.latitude != null || !!a.mapsUrl, isDefault: a.isDefault })) });
}
