import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { getSettings } from "./settings";
import { hashPassword, validatePassword } from "./passwords";
import { uniqueSlug } from "./restaurants";
import { normalizePhone } from "@/lib/phone";
import { isValidLatLng, MAX_ZONE_KM } from "@/lib/geo";

// Accounts created by a platform admin: complete restaurants (owner + profile + delivery +
// commission, optionally live right away) and customer accounts.

export type AdminFormResult = { ok: true; id: string; message: string } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const pct = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 50), "Commission rate must be between 0 and 50%");

export const adminRestaurantSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the restaurant name").max(80),
  businessName: z.string().trim().max(120).optional(),
  cuisine: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  phone: z.string().trim().min(6, "Enter a phone number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(),
  area: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  currency: z.enum(["USD", "LBP"]).default("USD"),
  ownerName: z.string().trim().min(2, "Enter the owner's name").max(80),
  ownerEmail: z.string().trim().toLowerCase().email("Enter a valid email"),
  ownerPassword: z.string().optional(),
  commissionRate: pct,
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  deliveryEnabled: z.boolean().default(true),
  pickupEnabled: z.boolean().default(true),
  deliveryKm: z.coerce.number().optional(),
  deliveryFee: z.string().trim().optional(),
  avgPrepMinutes: z.coerce.number().int().min(5).max(180).default(25),
  live: z.boolean().default(false),
  agreementSigned: z.boolean().default(false),
  verified: z.boolean().default(false),
});
export type AdminRestaurantInput = z.input<typeof adminRestaurantSchema>;

const fieldErrors = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message]));

/** Creates a restaurant with its owner account. With `live` (and the agreement signed offline) it takes orders right away. */
export async function createRestaurantByAdmin(adminId: string, input: AdminRestaurantInput): Promise<AdminFormResult> {
  const parsed = adminRestaurantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const phone = normalizePhone(d.phone);
  if (!phone.ok) return { ok: false, fieldErrors: { phone: phone.error } };

  const hasPin = d.latitude !== undefined && d.longitude !== undefined && isValidLatLng(d.latitude, d.longitude);
  let zones: { maxKm: number; feeCents: number }[] = [];
  if (d.deliveryEnabled) {
    if (!hasPin) return { ok: false, fieldErrors: { location: "Pin the restaurant on the map — delivery distance is measured from it" } };
    const km = d.deliveryKm ?? 0;
    if (!(km > 0 && km <= MAX_ZONE_KM)) return { ok: false, fieldErrors: { deliveryKm: `Delivery radius must be between 0.5 and ${MAX_ZONE_KM} km` } };
    const fee = Number(d.deliveryFee || 0);
    if (!Number.isFinite(fee) || fee < 0) return { ok: false, fieldErrors: { deliveryFee: "Enter a valid fee (0 for free)" } };
    zones = [{ maxKm: Math.round(km * 10) / 10, feeCents: d.currency === "LBP" ? Math.round(fee) : Math.round(fee * 100) }];
  }
  if (!d.deliveryEnabled && !d.pickupEnabled) return { ok: false, fieldErrors: { deliveryEnabled: "Enable delivery, pickup, or both" } };

  const existing = await prisma.user.findUnique({ where: { email: d.ownerEmail } });
  if (!existing) {
    const pwErr = validatePassword(d.ownerPassword ?? "");
    if (pwErr) return { ok: false, fieldErrors: { ownerPassword: "Set a temporary password (min 8 characters) for the new account" } };
  }
  if (d.live && !d.agreementSigned) return { ok: false, fieldErrors: { agreementSigned: "To take orders, the owner must accept the commission agreement (tick it if they signed it offline)" } };

  const settings = await getSettings();
  const slug = await uniqueSlug(d.displayName);
  const restaurant = await prisma.$transaction(async (tx) => {
    const owner = existing ?? (await tx.user.create({ data: { email: d.ownerEmail, name: d.ownerName, phone: phone.e164, passwordHash: await hashPassword(d.ownerPassword!) } }));
    await tx.userRole.upsert({ where: { userId_role: { userId: owner.id, role: "RESTAURANT" } }, create: { userId: owner.id, role: "RESTAURANT" }, update: {} });
    return tx.restaurant.create({
      data: {
        slug,
        displayName: d.displayName,
        businessName: d.businessName || d.displayName,
        cuisine: d.cuisine || null,
        description: d.description || null,
        phone: phone.e164,
        email: d.email || d.ownerEmail,
        address: d.address || null,
        area: d.area || null,
        city: d.city || null,
        currency: d.currency,
        latitude: hasPin ? d.latitude : null,
        longitude: hasPin ? d.longitude : null,
        deliveryEnabled: d.deliveryEnabled,
        pickupEnabled: d.pickupEnabled,
        deliveryZones: zones,
        avgPrepMinutes: d.avgPrepMinutes,
        commissionRateBps: d.commissionRate ? Math.round(Number(d.commissionRate) * 100) : null,
        status: d.live ? "ACTIVE" : "DRAFT",
        orderingEnabled: d.live && d.agreementSigned,
        agreementAcceptedAt: d.agreementSigned ? new Date() : null,
        agreementVersion: d.agreementSigned ? settings.agreementVersion : null,
        verificationStatus: d.verified ? "APPROVED" : "NOT_REQUESTED",
        staff: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
  });
  await audit({ actorId: adminId, action: "restaurant.admin_create", entityType: "restaurant", entityId: restaurant.id, data: { ...d, ownerPassword: undefined, ownerExisted: !!existing } });
  return { ok: true, id: restaurant.id, message: d.live ? "Restaurant created and live" : "Restaurant created as a draft" };
}

export const adminCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  password: z.string(),
});
export type AdminCustomerInput = z.input<typeof adminCustomerSchema>;

export async function createCustomerByAdmin(adminId: string, input: AdminCustomerInput): Promise<AdminFormResult> {
  const parsed = adminCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const pwErr = validatePassword(d.password);
  if (pwErr) return { ok: false, fieldErrors: { password: pwErr } };
  let phone: string | null = null;
  if (d.phone) {
    const p = normalizePhone(d.phone);
    if (!p.ok) return { ok: false, fieldErrors: { phone: p.error } };
    phone = p.e164;
  }
  if (await prisma.user.findUnique({ where: { email: d.email } })) return { ok: false, fieldErrors: { email: "An account with this email already exists" } };
  const user = await prisma.user.create({ data: { name: d.name, email: d.email, phone, passwordHash: await hashPassword(d.password), roles: { create: { role: "CUSTOMER" } } } });
  await audit({ actorId: adminId, action: "customer.admin_create", entityType: "user", entityId: user.id, data: { email: d.email } });
  return { ok: true, id: user.id, message: "Customer account created" };
}

/**
 * Sets one commission rate for many restaurants at once (a custom rate per restaurant).
 * `rate` null puts them back on the platform default.
 */
export async function setCommissionForRestaurants(adminId: string, ids: string[], rate: string | null) {
  const unique = [...new Set(ids)].slice(0, 5000);
  if (!unique.length) throw new Error("Select at least one restaurant");
  let bps: number | null = null;
  if (rate !== null && rate.trim() !== "") {
    const v = Number(rate);
    if (!Number.isFinite(v) || v < 0 || v > 50) throw new Error("Commission rate must be between 0 and 50%");
    bps = Math.round(v * 100);
  }
  const before = await prisma.restaurant.findMany({ where: { id: { in: unique } }, select: { id: true, commissionRateBps: true } });
  const changed = before.filter((r) => r.commissionRateBps !== bps).map((r) => r.id);
  if (changed.length) await prisma.restaurant.updateMany({ where: { id: { in: changed } }, data: { commissionRateBps: bps } });
  await audit({ actorId: adminId, action: "restaurant.commission_bulk", entityType: "restaurant", data: { rateBps: bps, count: changed.length, ids: changed.slice(0, 200) } });
  return { changed };
}
