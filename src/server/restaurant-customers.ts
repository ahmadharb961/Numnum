import "server-only";
import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatPhone } from "@/lib/phone";

// Dashboard → Customers: everyone who ordered from the restaurant (completed orders), one row per
// phone number, with their latest name and address, and how often they ordered.

export const CUSTOMERS_PAGE = 50;
const EXPORT_MAX = 50_000;

export type RestaurantCustomer = {
  phone: string;
  name: string;
  address: string | null;
  area: string | null;
  orders: number;
  spentCents: number;
  firstAt: Date;
  lastAt: Date;
};

function rows(restaurantId: string, search: string | undefined, limit: number, offset: number) {
  const term = search?.trim().slice(0, 60);
  const digits = term?.replace(/\D/g, "") ?? "";
  // Search by name or (part of the) phone number.
  const filter = term
    ? Prisma.sql`AND (l."name" ILIKE ${`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}${digits.length >= 3 ? Prisma.sql` OR c."phone" LIKE ${`%${digits}%`}` : Prisma.empty})`
    : Prisma.empty;
  return prisma.$queryRaw<{ phone: string; name: string; address: string | null; building: string | null; area: string | null; orders: number; spent: bigint; firstAt: Date; lastAt: Date; total: number }[]>`
    WITH done AS (
      SELECT "customerPhone" AS phone, "customerName" AS name, "address", "building", "deliveryArea" AS area, "totalCents", "createdAt"
      FROM "orders"
      WHERE "restaurantId" = ${restaurantId} AND "status" = 'COMPLETED' AND "customerPhone" <> ''
    ),
    c AS (SELECT phone, count(*)::int AS orders, sum("totalCents")::bigint AS spent, min("createdAt") AS "firstAt", max("createdAt") AS "lastAt" FROM done GROUP BY phone),
    l AS (SELECT DISTINCT ON (phone) phone, name FROM done ORDER BY phone, "createdAt" DESC),
    a AS (SELECT DISTINCT ON (phone) phone, "address", "building", area FROM done WHERE "address" IS NOT NULL ORDER BY phone, "createdAt" DESC)
    SELECT c.phone, l.name, a."address", a."building", a.area, c.orders, c.spent, c."firstAt", c."lastAt", count(*) OVER ()::int AS total
    FROM c JOIN l USING (phone) LEFT JOIN a USING (phone)
    WHERE true ${filter}
    ORDER BY c.orders DESC, c."lastAt" DESC
    LIMIT ${limit} OFFSET ${offset}`;
}

const toCustomer = (r: Awaited<ReturnType<typeof rows>>[number]): RestaurantCustomer => ({
  phone: r.phone,
  name: r.name,
  address: [r.address, r.building].filter(Boolean).join(", ") || null,
  area: r.area,
  orders: r.orders,
  spentCents: Number(r.spent),
  firstAt: r.firstAt,
  lastAt: r.lastAt,
});

export async function listRestaurantCustomers(restaurantId: string, search?: string, page = 1) {
  const p = Math.max(1, Math.min(page, 1000));
  const r = await rows(restaurantId, search, CUSTOMERS_PAGE, (p - 1) * CUSTOMERS_PAGE);
  return { customers: r.map(toCustomer), total: r[0]?.total ?? 0, page: p };
}

/** The whole list as a spreadsheet (opens in Excel / Google Sheets, Arabic names included). */
export async function restaurantCustomersCsv(restaurantId: string, currency: string) {
  const list = (await rows(restaurantId, undefined, EXPORT_MAX, 0)).map(toCustomer);
  const money = (c: number) => (currency === "LBP" ? String(c) : (c / 100).toFixed(2));
  const fields = ["Name", "Phone", "Address", "Area", "Orders", `Total spent (${currency})`, "First order", "Last order"];
  const data = list.map((c) => [c.name, formatPhone(c.phone) || c.phone, c.address ?? "", c.area ?? "", String(c.orders), money(c.spentCents), c.firstAt.toISOString().slice(0, 10), c.lastAt.toISOString().slice(0, 10)]);
  // The BOM makes Excel read Arabic correctly; escapeFormulae keeps a name like "=1+1" plain text.
  return "\uFEFF" + Papa.unparse({ fields, data }, { escapeFormulae: true });
}
