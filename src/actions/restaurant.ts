"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRestaurant, hashPassword } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { notifyAdmins } from "@/server/notifications";
import { normalizePhone } from "@/lib/phone";
import { parseAmount } from "@/lib/money";
import { DAYS, isValidTime, type OpeningHours } from "@/lib/hours";
import { isValidLatLng, MAX_ZONE_KM, normalizeZones, type DeliveryZone } from "@/lib/geo";
import { uniqueSlug } from "@/server/restaurants";
import type { FormState } from "./auth";
import type { ActionResult } from "./menu";

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  businessName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).optional(),
  cuisine: z.string().trim().max(60).optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(),
  area: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  mapsUrl: z.string().trim().url().optional().or(z.literal("")),
  instagram: z.string().trim().url().optional().or(z.literal("")),
  facebook: z.string().trim().url().optional().or(z.literal("")),
  tiktok: z.string().trim().url().optional().or(z.literal("")),
  website: z.string().trim().url().optional().or(z.literal("")),
  logoUrl: z.string().optional(),
  coverUrl: z.string().optional(),
});

export async function saveProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRestaurant("MANAGER");
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) };
  const d = parsed.data;
  let phone: string | null = null;
  if (d.phone) {
    const p = normalizePhone(d.phone);
    if (!p.ok) return { fieldErrors: { phone: p.error } };
    phone = p.e164;
  }
  // only accept media URLs that belong to this restaurant
  const media = async (url?: string) => (url ? ((await prisma.mediaAsset.findFirst({ where: { restaurantId: ctx.restaurant.id, url } })) ? url : undefined) : undefined);
  const slugChanged = d.displayName !== ctx.restaurant.displayName && ctx.restaurant.status === "DRAFT";
  await prisma.restaurant.update({
    where: { id: ctx.restaurant.id },
    data: {
      displayName: d.displayName,
      businessName: d.businessName,
      slug: slugChanged ? await uniqueSlug(d.displayName, ctx.restaurant.id) : undefined,
      description: d.description || null,
      cuisine: d.cuisine || null,
      phone,
      email: d.email || null,
      address: d.address || null,
      area: d.area || null,
      city: d.city || null,
      mapsUrl: d.mapsUrl || null,
      socialLinks: { instagram: d.instagram || undefined, facebook: d.facebook || undefined, tiktok: d.tiktok || undefined, website: d.website || undefined },
      logoUrl: (await media(d.logoUrl)) ?? undefined,
      coverUrl: (await media(d.coverUrl)) ?? undefined,
    },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Business details saved" };
}

export async function saveOrderingAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  const min = String(form.get("minOrder") || "").trim();
  const minCents = min ? parseAmount(min, r.currency) : null;
  if (min && (minCents === null || minCents < 0)) return { fieldErrors: { minOrder: "Enter a valid amount or leave empty" } };
  const prep = Number(form.get("avgPrepMinutes") || 30);
  if (!Number.isInteger(prep) || prep < 5 || prep > 180) return { fieldErrors: { avgPrepMinutes: "Between 5 and 180 minutes" } };
  const deliveryEnabled = form.get("deliveryEnabled") === "on";
  const pickupEnabled = form.get("pickupEnabled") === "on";
  if (!deliveryEnabled && !pickupEnabled) return { error: "Enable delivery, pickup, or both" };
  const currency = String(form.get("currency") || r.currency);
  const settings = await getSettings();
  if (!settings.supportedCurrencies.includes(currency)) return { fieldErrors: { currency: "Unsupported currency" } };
  if (currency !== r.currency && (await prisma.menuItem.count({ where: { restaurantId: r.id } }))) return { fieldErrors: { currency: "Menu currency can't be changed after items are added" } };

  // Restaurant pin + delivery zones by distance.
  const lat = Number(form.get("latitude"));
  const lng = Number(form.get("longitude"));
  const hasPin = isValidLatLng(lat, lng);
  let zonesIn: { maxKm: string; fee: string }[] = [];
  try {
    zonesIn = JSON.parse(String(form.get("zones") || "[]"));
  } catch {}
  const zones: DeliveryZone[] = [];
  for (const z of zonesIn) {
    if (!String(z.maxKm).trim() && !String(z.fee).trim()) continue;
    const km = Number(z.maxKm);
    const fee = parseAmount(String(z.fee || "0"), currency);
    if (!Number.isFinite(km) || km <= 0 || km > MAX_ZONE_KM) return { fieldErrors: { zones: `Distances must be between 0.1 and ${MAX_ZONE_KM} km` } };
    if (fee === null || fee < 0) return { fieldErrors: { zones: "Enter a valid fee for each zone (0 for free)" } };
    zones.push({ maxKm: Math.round(km * 10) / 10, feeCents: fee });
  }
  const sorted = normalizeZones(zones);
  if (new Set(sorted.map((z) => z.maxKm)).size !== sorted.length) return { fieldErrors: { zones: "Each zone needs a different distance" } };
  if (deliveryEnabled && !hasPin) return { fieldErrors: { location: "Pin your restaurant on the map — delivery distance is measured from it" } };
  if (deliveryEnabled && !sorted.length) return { fieldErrors: { zones: "Add at least one delivery zone (e.g. up to 5 km)" } };

  await prisma.restaurant.update({
    where: { id: r.id },
    data: {
      deliveryEnabled,
      pickupEnabled,
      deliveryZones: sorted,
      latitude: hasPin ? lat : r.latitude,
      longitude: hasPin ? lng : r.longitude,
      minOrderCents: minCents,
      avgPrepMinutes: prep,
      currency,
      orderingEnabled: r.agreementAcceptedAt ? form.get("orderingEnabled") === "on" : false,
    },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Ordering settings saved" };
}

export async function saveHoursAction(hours: OpeningHours): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const clean: OpeningHours = {};
  for (const d of DAYS) {
    const slots = (hours[d] ?? []).filter((s) => isValidTime(s.open) && isValidTime(s.close)).slice(0, 3);
    if (slots.length) clean[d] = slots;
  }
  await prisma.restaurant.update({ where: { id: ctx.restaurant.id }, data: { openingHours: clean } });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Hours saved" };
}

export async function acceptAgreementAction(): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  const s = await getSettings();
  await prisma.restaurant.update({ where: { id: ctx.restaurant.id }, data: { agreementAcceptedAt: new Date(), agreementVersion: s.agreementVersion, agreementAcceptedBy: ctx.user.id, orderingEnabled: true } });
  await audit({ actorId: ctx.user.id, action: "agreement.accept", entityType: "restaurant", entityId: ctx.restaurant.id, data: { version: s.agreementVersion, rateBps: ctx.restaurant.commissionRateBps ?? s.defaultCommissionRateBps } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Agreement accepted. Online ordering is on." };
}

export async function publishProfileAction(): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  const s = await getSettings();
  const items = await prisma.menuItem.count({ where: { restaurantId: r.id, archived: false } });
  const missing = [!r.displayName && "restaurant name", !r.phone && "restaurant phone", !items && "at least one menu item", !r.agreementAcceptedAt && "commission agreement"].filter(Boolean);
  if (missing.length) return { ok: false, error: `Before publishing, add: ${missing.join(", ")}` };
  if (r.status === "ACTIVE") return { ok: true, message: "Already live" };
  if (r.status === "SUSPENDED") return { ok: false, error: "Your account is suspended. Contact support." };
  const next = s.requireRestaurantApproval ? "PENDING_APPROVAL" : "ACTIVE";
  await prisma.restaurant.update({ where: { id: r.id }, data: { status: next, publishedAt: next === "ACTIVE" ? new Date() : undefined } });
  await audit({ actorId: ctx.user.id, action: "restaurant.publish_request", entityType: "restaurant", entityId: r.id, data: { status: next } });
  if (next === "PENDING_APPROVAL") await notifyAdmins({ type: "RESTAURANT_APPROVAL", title: `${r.displayName} requested to go live`, link: `/admin/restaurants/${r.id}` });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: next === "ACTIVE" ? "Your profile is live!" : "Submitted for review. We'll notify you once approved." };
}

export async function requestVerificationAction(input: { legalName: string; registration: string; contactName: string; contactRole: string; notes: string; documentIds: string[] }): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  if (!input.legalName.trim() || !input.contactName.trim()) return { ok: false, error: "Enter the legal business name and contact person" };
  if (!input.documentIds.length) return { ok: false, error: "Attach at least one supporting document (e.g. commercial registration)" };
  if (r.verificationStatus === "PENDING") return { ok: false, error: "A verification request is already pending" };
  if (r.verificationStatus === "APPROVED") return { ok: false, error: "Your restaurant is already verified" };
  const docs = await prisma.mediaAsset.findMany({ where: { id: { in: input.documentIds }, restaurantId: r.id, kind: "DOCUMENT" } });
  await prisma.$transaction(async (tx) => {
    const v = await tx.restaurantVerification.create({ data: { restaurantId: r.id, legalName: input.legalName.trim(), registration: input.registration.trim() || null, contactName: input.contactName.trim(), contactRole: input.contactRole.trim() || null, notes: input.notes.trim() || null } });
    await tx.mediaAsset.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { verificationId: v.id } });
    await tx.restaurant.update({ where: { id: r.id }, data: { verificationStatus: "PENDING" } });
    await notifyAdmins({ type: "VERIFICATION_REQUEST", title: `Verification request from ${r.displayName}`, link: `/admin/verifications` }, tx);
  });
  await audit({ actorId: ctx.user.id, action: "verification.request", entityType: "restaurant", entityId: r.id });
  revalidatePath("/dashboard/verification");
  return { ok: true, message: "Verification request submitted" };
}

export async function replyReviewAction(kind: "item" | "restaurant", id: string, reply: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const text = reply.trim().slice(0, 1000) || null;
  if (kind === "item") await prisma.itemReview.update({ where: { id, restaurantId: ctx.restaurant.id }, data: { reply: text, repliedAt: text ? new Date() : null } });
  else await prisma.restaurantReview.update({ where: { id, restaurantId: ctx.restaurant.id }, data: { reply: text, repliedAt: text ? new Date() : null } });
  revalidatePath("/dashboard/reviews");
  return { ok: true, message: text ? "Reply posted" : "Reply removed" };
}

export async function reportReviewAction(kind: "item" | "restaurant", id: string, reason: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const exists = kind === "item" ? await prisma.itemReview.findFirst({ where: { id, restaurantId: ctx.restaurant.id } }) : await prisma.restaurantReview.findFirst({ where: { id, restaurantId: ctx.restaurant.id } });
  if (!exists) return { ok: false, error: "Review not found" };
  try {
    await prisma.report.create({ data: { targetType: kind === "item" ? "ITEM_REVIEW" : "RESTAURANT_REVIEW", targetId: id, reason, reporterKey: `r:${ctx.restaurant.id}`, reporterRestaurantId: ctx.restaurant.id } });
  } catch {
    return { ok: true, message: "Already reported" };
  }
  await notifyAdmins({ type: "REPORT", title: `${ctx.restaurant.displayName} reported a review`, body: reason, link: "/admin/moderation" });
  return { ok: true, message: "Reported to moderators" };
}

export async function addStaffAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRestaurant("OWNER");
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();
  const role = String(form.get("role") || "STAFF") as "STAFF" | "MANAGER" | "OWNER";
  const password = String(form.get("password") || "");
  if (!["STAFF", "MANAGER", "OWNER"].includes(role)) return { error: "Invalid role" };
  if (!z.string().email().safeParse(email).success) return { fieldErrors: { email: "Enter a valid email" } };
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (name.length < 2) return { fieldErrors: { name: "Enter their name" } };
    if (password.length < 8) return { fieldErrors: { password: "Set a temporary password (min 8 characters) for the new account" } };
    user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(password), roles: { create: { role: "RESTAURANT" } } } });
  } else {
    await prisma.userRole.upsert({ where: { userId_role: { userId: user.id, role: "RESTAURANT" } }, create: { userId: user.id, role: "RESTAURANT" }, update: {} });
  }
  await prisma.restaurantStaff.upsert({ where: { restaurantId_userId: { restaurantId: ctx.restaurant.id, userId: user.id } }, create: { restaurantId: ctx.restaurant.id, userId: user.id, role }, update: { role } });
  await audit({ actorId: ctx.user.id, action: "staff.add", entityType: "restaurant", entityId: ctx.restaurant.id, data: { email, role } });
  revalidatePath("/dashboard/staff");
  return { ok: true, message: `${email} can now access the dashboard as ${role.toLowerCase()}` };
}

export async function removeStaffAction(staffId: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  const s = await prisma.restaurantStaff.findFirst({ where: { id: staffId, restaurantId: ctx.restaurant.id } });
  if (!s) return { ok: false, error: "Not found" };
  if (s.userId === ctx.user.id) return { ok: false, error: "You can't remove yourself" };
  if (s.role === "OWNER" && (await prisma.restaurantStaff.count({ where: { restaurantId: ctx.restaurant.id, role: "OWNER" } })) <= 1) return { ok: false, error: "A restaurant needs at least one owner" };
  await prisma.restaurantStaff.delete({ where: { id: staffId } });
  await audit({ actorId: ctx.user.id, action: "staff.remove", entityType: "restaurant", entityId: ctx.restaurant.id, data: { userId: s.userId } });
  revalidatePath("/dashboard/staff");
  return { ok: true };
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const ctx = await requireRestaurant("STAFF");
  await prisma.notification.updateMany({ where: { restaurantId: ctx.restaurant.id, audience: "RESTAURANT", readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}


