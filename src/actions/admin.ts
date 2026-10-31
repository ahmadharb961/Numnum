"use server";

import { revalidatePath } from "next/cache";
import type { RestaurantStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { audit } from "@/server/audit";
import { ipHash } from "@/server/request";
import { notifyRestaurant } from "@/server/notifications";
import { getSettings, updateSetting, type Settings } from "@/server/settings";
import { adminCancelOrder } from "@/server/orders";
import { sendBroadcast, type BroadcastInput, type BroadcastResult } from "@/server/broadcast";
import { applyAdjustmentToInvoice, createAdjustment, decideAdjustment, generateInvoice, recordManualPayment, resolveDispute, reviewPayment, runBillingMaintenance, runMonthlyBilling, previewInvoice, refreshInvoiceStatus, type PaymentReview } from "@/server/billing";
import { recomputeItemRating, recomputeRestaurantRating } from "@/server/reviews";
import { parseAmount } from "@/lib/money";
import { slugify } from "@/lib/slug";
import type { ActionResult } from "./menu";
import { createCustomerByAdmin, createRestaurantByAdmin, setCommissionForRestaurants, type AdminCustomerInput, type AdminFormResult, type AdminRestaurantInput } from "@/server/admin-accounts";

async function admin() {
  const u = await requireAdmin();
  return { user: u, ip: await ipHash() };
}

function wrap<T>(fn: () => Promise<T>, msg?: string): Promise<ActionResult<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data, message: msg }))
    .catch((e: Error) => ({ ok: false as const, error: e.message }));
}

// ───── Restaurants ─────

export async function setRestaurantStatusAction(id: string, status: RestaurantStatus, reason?: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    const r = await prisma.restaurant.update({ where: { id }, data: { status, suspendedReason: status === "SUSPENDED" ? reason || "Suspended by administrator" : null, publishedAt: status === "ACTIVE" ? new Date() : undefined } });
    await audit({ actorId: user.id, action: `restaurant.status.${status.toLowerCase()}`, entityType: "restaurant", entityId: id, data: { reason }, ipHash: ip });
    const msg = { ACTIVE: "Your restaurant is live on numnum!", SUSPENDED: `Your restaurant was suspended${reason ? `: ${reason}` : ""}.`, PENDING_APPROVAL: "Your restaurant is pending review.", DRAFT: "Your restaurant was moved back to draft.", CLOSED: "Your restaurant was closed." }[status];
    await notifyRestaurant(r.id, { type: "ACCOUNT_STATUS", title: msg, link: "/dashboard" }, undefined, { email: true });
    revalidatePath(`/admin/restaurants/${id}`);
  }, "Status updated");
}

export async function updateRestaurantAdminAction(id: string, input: { commissionRate?: string; restrictReels?: boolean; restrictPromotion?: boolean; orderingEnabled?: boolean }) {
  const { user, ip } = await admin();
  return wrap(async () => {
    const data: { commissionRateBps?: number | null; restrictReels?: boolean; restrictPromotion?: boolean; orderingEnabled?: boolean } = {};
    if (input.commissionRate !== undefined) {
      if (input.commissionRate.trim() === "") data.commissionRateBps = null;
      else {
        const pct = Number(input.commissionRate);
        if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new Error("Commission rate must be between 0 and 50%");
        data.commissionRateBps = Math.round(pct * 100);
      }
    }
    if (input.restrictReels !== undefined) data.restrictReels = input.restrictReels;
    if (input.restrictPromotion !== undefined) data.restrictPromotion = input.restrictPromotion;
    if (input.orderingEnabled !== undefined) data.orderingEnabled = input.orderingEnabled;
    const before = await prisma.restaurant.findUniqueOrThrow({ where: { id }, select: { commissionRateBps: true, restrictReels: true, restrictPromotion: true, orderingEnabled: true } });
    await prisma.restaurant.update({ where: { id }, data });
    await audit({ actorId: user.id, action: "restaurant.admin_update", entityType: "restaurant", entityId: id, data: { before, after: data }, ipHash: ip });
    if (data.commissionRateBps !== undefined) await notifyRestaurant(id, { type: "COMMISSION_RATE", title: "Your commission rate was updated", body: "The new rate applies to future order requests only.", link: "/dashboard/billing" });
    revalidatePath(`/admin/restaurants/${id}`);
  }, "Saved");
}

// ───── Verification ─────

export async function decideVerificationAction(verificationId: string, status: Extract<VerificationStatus, "APPROVED" | "REJECTED" | "INFO_REQUIRED">, note: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    if (status !== "APPROVED" && !note.trim()) throw new Error("Add a note for the restaurant");
    const v = await prisma.restaurantVerification.update({ where: { id: verificationId }, data: { status, adminNote: note || null, reviewedById: user.id, reviewedAt: new Date() } });
    await prisma.restaurant.update({ where: { id: v.restaurantId }, data: { verificationStatus: status } });
    await audit({ actorId: user.id, action: `verification.${status.toLowerCase()}`, entityType: "restaurant", entityId: v.restaurantId, data: { note }, ipHash: ip });
    await notifyRestaurant(v.restaurantId, { type: "VERIFICATION_UPDATE", title: status === "APPROVED" ? "You're verified! ✓" : status === "REJECTED" ? "Verification request rejected" : "More information needed for verification", body: note || undefined, link: "/dashboard/verification" }, undefined, { email: true });
    revalidatePath("/admin/verifications");
  }, "Decision saved");
}

export async function revokeVerificationAction(restaurantId: string, note: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    if (!note.trim()) throw new Error("Explain why the badge is revoked");
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { verificationStatus: "REVOKED" } });
    await prisma.restaurantVerification.create({ data: { restaurantId, status: "REVOKED", adminNote: note, reviewedById: user.id, reviewedAt: new Date() } });
    await audit({ actorId: user.id, action: "verification.revoke", entityType: "restaurant", entityId: restaurantId, data: { note }, ipHash: ip });
    await notifyRestaurant(restaurantId, { type: "VERIFICATION_UPDATE", title: "Your verified badge was revoked", body: note, link: "/dashboard/verification" }, undefined, { email: true });
    revalidatePath(`/admin/restaurants/${restaurantId}`);
  }, "Badge revoked");
}

// ───── Orders ─────

export async function adminCancelOrderAction(orderId: string, note: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    if (!note.trim()) throw new Error("Add a note");
    await adminCancelOrder(user.id, orderId, note);
    await audit({ actorId: user.id, action: "order.cancel", entityType: "order", entityId: orderId, data: { note }, ipHash: ip });
    revalidatePath("/admin/orders");
  }, "Order updated");
}

export async function clearSuspiciousAction(orderId: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { suspicious: false } });
    await audit({ actorId: user.id, action: "order.clear_suspicious", entityType: "order", entityId: orderId, ipHash: ip });
    revalidatePath("/admin/orders");
  }, "Flag cleared");
}

// ───── Commission, invoices, payments ─────

export async function previewInvoicesAction(period: string) {
  await admin();
  return wrap(async () => {
    const rids = new Set<string>();
    for (const r of await prisma.commissionEvent.findMany({ where: { status: "ACCRUED", invoiceId: null, period: { lte: period } }, select: { restaurantId: true }, distinct: ["restaurantId"] })) rids.add(r.restaurantId);
    for (const r of await prisma.commissionAdjustment.findMany({ where: { status: "APPROVED", invoiceId: null }, select: { restaurantId: true }, distinct: ["restaurantId"] })) rids.add(r.restaurantId);
    const names = await prisma.restaurant.findMany({ where: { id: { in: [...rids] } }, select: { id: true, displayName: true } });
    const rows = [];
    for (const id of rids) {
      const p = await previewInvoice(id, period);
      const existing = await prisma.invoice.findUnique({ where: { restaurantId_period: { restaurantId: id, period } }, select: { number: true } });
      rows.push({ restaurantId: id, name: names.find((n) => n.id === id)?.displayName ?? id, orders: p.events.length, subtotalCents: p.grossSubtotalCents, commissionCents: p.grossCommissionCents, adjustmentsCents: p.adjustmentsCents, totalCents: p.totalCents, existing: existing?.number ?? null });
    }
    return rows;
  });
}

export async function generateInvoicesAction(period: string, restaurantId?: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    const results = restaurantId ? [{ restaurantId, ...(await generateInvoice(restaurantId, period, user.id)) }].map((r) => ({ restaurantId: r.restaurantId, number: r.invoice?.number, created: r.created })) : await runMonthlyBilling(period, user.id);
    await audit({ actorId: user.id, action: "billing.generate_invoices", entityType: "billing", data: { period, restaurantId, created: results.filter((r) => r.created).length }, ipHash: ip });
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/invoices");
    return results;
  });
}

export async function runMaintenanceAction() {
  const { user } = await admin();
  return wrap(async () => {
    const r = await runBillingMaintenance();
    await audit({ actorId: user.id, action: "billing.maintenance", entityType: "billing", data: r });
    revalidatePath("/admin/invoices");
    return r;
  });
}

export async function createAdjustmentAction(input: { restaurantId: string; amount: string; reason: string; commissionEventId?: string; approve: boolean; applyToInvoiceId?: string }) {
  const { user } = await admin();
  return wrap(async () => {
    const cents = parseAmount(input.amount, "USD");
    if (cents === null || cents === 0) throw new Error("Enter a non-zero amount (negative for a credit)");
    const adj = await createAdjustment(user.id, { restaurantId: input.restaurantId, amountCents: cents, reason: input.reason, commissionEventId: input.commissionEventId, approve: input.approve });
    if (input.approve && input.applyToInvoiceId) await applyAdjustmentToInvoice(user.id, adj.id, input.applyToInvoiceId);
    revalidatePath("/admin/commissions");
    revalidatePath(`/admin/restaurants/${input.restaurantId}`);
  }, "Adjustment recorded");
}

export async function decideAdjustmentAction(id: string, approve: boolean) {
  const { user } = await admin();
  return wrap(async () => {
    await decideAdjustment(user.id, id, approve);
    revalidatePath("/admin/commissions");
  }, approve ? "Approved" : "Rejected");
}

export async function applyAdjustmentAction(adjustmentId: string, invoiceId: string) {
  const { user } = await admin();
  return wrap(async () => {
    await applyAdjustmentToInvoice(user.id, adjustmentId, invoiceId);
    revalidatePath(`/admin/invoices/${invoiceId}`);
  }, "Applied to invoice");
}

export async function voidCommissionAction(eventId: string, reason: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    if (!reason.trim()) throw new Error("A reason is required");
    const ev = await prisma.commissionEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (ev.status === "INVOICED") throw new Error("Invoiced entries can't be voided — create a credit adjustment instead");
    await prisma.commissionEvent.update({ where: { id: eventId }, data: { status: "VOIDED" } });
    await prisma.orderEvent.create({ data: { orderId: ev.orderId, type: "COMMISSION_VOIDED", actorType: "ADMIN", actorId: user.id, data: { reason } } });
    await audit({ actorId: user.id, action: "commission.void", entityType: "commission_event", entityId: eventId, data: { reason }, ipHash: ip });
    revalidatePath("/admin/commissions");
  }, "Entry voided");
}

export async function reviewPaymentAction(paymentId: string, action: "APPROVE" | "REJECT" | "MORE_INFO", amount: string, note: string) {
  const { user } = await admin();
  return wrap(async () => {
    let review: PaymentReview;
    if (action === "APPROVE") {
      const cents = parseAmount(amount, "USD");
      if (cents === null || cents <= 0) throw new Error("Enter the verified amount actually received");
      review = { action, verifiedAmountCents: cents, note };
    } else review = { action, note };
    await reviewPayment(user.id, paymentId, review);
    revalidatePath("/admin/payments");
  }, "Payment reviewed");
}

export async function recordManualPaymentAction(invoiceId: string, amount: string, reference: string, note: string) {
  const { user } = await admin();
  return wrap(async () => {
    const cents = parseAmount(amount, "USD");
    if (cents === null || cents <= 0) throw new Error("Enter a positive amount");
    if (!note.trim()) throw new Error("Describe how the payment was reconciled");
    await recordManualPayment(user.id, invoiceId, cents, reference, note);
    revalidatePath(`/admin/invoices/${invoiceId}`);
  }, "Payment recorded");
}

export async function refreshInvoiceAction(invoiceId: string) {
  await admin();
  return wrap(async () => {
    await prisma.$transaction((tx) => refreshInvoiceStatus(tx, invoiceId));
    revalidatePath(`/admin/invoices/${invoiceId}`);
  });
}

export async function resolveDisputeAction(id: string, accept: boolean, resolution: string) {
  const { user } = await admin();
  return wrap(async () => {
    await resolveDispute(user.id, id, accept, resolution);
    revalidatePath("/admin/disputes");
  }, "Dispute resolved");
}

export async function markDisputeReviewingAction(id: string) {
  const { user } = await admin();
  return wrap(async () => {
    await prisma.commissionDispute.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
    await audit({ actorId: user.id, action: "dispute.review", entityType: "commission_dispute", entityId: id });
    revalidatePath("/admin/disputes");
  });
}

// ───── Moderation ─────

export async function moderateReelAction(id: string, action: "REMOVE" | "RESTORE" | "FEATURE" | "UNFEATURE" | "SPONSOR" | "UNSPONSOR", reason?: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    const reel = await prisma.reel.findUniqueOrThrow({ where: { id }, include: { restaurant: { select: { restrictPromotion: true } } } });
    const data =
      action === "REMOVE"
        ? { visibility: "REMOVED" as const, removedReason: reason || "Violates content guidelines" }
        : action === "RESTORE"
          ? { visibility: "UNPUBLISHED" as const, removedReason: null }
          : action === "FEATURE" || action === "UNFEATURE"
            ? { featured: action === "FEATURE" }
            : { sponsored: action === "SPONSOR" };
    if ((action === "FEATURE" || action === "SPONSOR") && reel.restaurant.restrictPromotion) throw new Error("This restaurant's promoted content is restricted");
    await prisma.reel.update({ where: { id }, data });
    await audit({ actorId: user.id, action: `reel.${action.toLowerCase()}`, entityType: "reel", entityId: id, data: { reason }, ipHash: ip });
    if (action === "REMOVE") await notifyRestaurant(reel.restaurantId, { type: "CONTENT_REMOVED", title: "A reel was removed by moderation", body: reason, link: `/dashboard/reels/${id}` });
    revalidatePath("/admin/moderation");
  }, "Done");
}

export async function moderateReviewAction(kind: "item" | "restaurant", id: string, status: "VISIBLE" | "HIDDEN" | "REMOVED", reason: string) {
  const { user, ip } = await admin();
  return wrap(async () => {
    if (kind === "item") {
      const r = await prisma.itemReview.update({ where: { id }, data: { status } });
      await recomputeItemRating(r.menuItemId);
    } else {
      const r = await prisma.restaurantReview.update({ where: { id }, data: { status } });
      await recomputeRestaurantRating(r.restaurantId);
    }
    await audit({ actorId: user.id, action: `review.${status.toLowerCase()}`, entityType: kind === "item" ? "item_review" : "restaurant_review", entityId: id, data: { reason }, ipHash: ip });
    revalidatePath("/admin/moderation");
  }, "Review updated");
}

export async function resolveReportAction(id: string, outcome: "ACTIONED" | "DISMISSED", resolution: string) {
  const { user } = await admin();
  return wrap(async () => {
    await prisma.report.update({ where: { id }, data: { status: outcome, resolution, resolvedById: user.id, resolvedAt: new Date() } });
    await audit({ actorId: user.id, action: `report.${outcome.toLowerCase()}`, entityType: "report", entityId: id, data: { resolution } });
    revalidatePath("/admin/moderation");
  }, "Report closed");
}

// ───── Categories ─────

export async function saveFoodCategoryAction(input: { id?: string; name: string; nameAr?: string; emoji?: string; imageUrl?: string; sortOrder?: number; active?: boolean }) {
  const { user } = await admin();
  return wrap(async () => {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const imageUrl = input.imageUrl?.trim() || null;
    if (imageUrl && !/^\/(categories|media)\//.test(imageUrl)) throw new Error("Upload the image here");
    const data = { name, nameAr: input.nameAr?.trim() || null, emoji: input.emoji?.trim() || null, imageUrl, sortOrder: input.sortOrder ?? 0, active: input.active ?? true };
    if (input.id) await prisma.foodCategory.update({ where: { id: input.id }, data });
    else await prisma.foodCategory.create({ data: { ...data, slug: slugify(name) } });
    await audit({ actorId: user.id, action: input.id ? "category.update" : "category.create", entityType: "food_category", entityId: input.id, data });
    revalidatePath("/admin/categories");
    revalidatePath("/restaurants");
  }, "Category saved");
}

export async function mergeFoodCategoryAction(fromId: string, intoId: string) {
  const { user } = await admin();
  return wrap(async () => {
    if (fromId === intoId) throw new Error("Choose a different category");
    const moved = await prisma.menuItem.updateMany({ where: { foodCategoryId: fromId }, data: { foodCategoryId: intoId } });
    await prisma.foodCategory.delete({ where: { id: fromId } });
    await audit({ actorId: user.id, action: "category.merge", entityType: "food_category", entityId: intoId, data: { fromId, moved: moved.count } });
    revalidatePath("/admin/categories");
  }, "Categories merged");
}

export async function deleteFoodCategoryAction(id: string) {
  const { user } = await admin();
  return wrap(async () => {
    await prisma.foodCategory.delete({ where: { id } });
    await audit({ actorId: user.id, action: "category.delete", entityType: "food_category", entityId: id });
    revalidatePath("/admin/categories");
  }, "Category removed");
}

// ───── Settings ─────

export async function saveSettingsAction(patch: Partial<Settings>) {
  const { user, ip } = await admin();
  return wrap(async () => {
    const current = await getSettings();
    if (patch.defaultCommissionRateBps !== undefined && (patch.defaultCommissionRateBps < 0 || patch.defaultCommissionRateBps > 5000)) throw new Error("Commission must be between 0% and 50%");
    if (patch.autoCompleteHours !== undefined && (patch.autoCompleteHours < 1 || patch.autoCompleteHours > 72)) throw new Error("Auto-complete must be between 1 and 72 hours");
    if (patch.lbpPerUsd !== undefined && !(patch.lbpPerUsd > 0)) throw new Error("Exchange rate must be positive");
    if (patch.invoiceDueDays !== undefined && (patch.invoiceDueDays < 1 || patch.invoiceDueDays > 90)) throw new Error("Due days must be 1–90");
    for (const [k, v] of Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][]) {
      await updateSetting(k, v as never, user.id);
    }
    await audit({ actorId: user.id, action: "settings.update", entityType: "platform_settings", data: { keys: Object.keys(patch), before: Object.fromEntries(Object.keys(patch).map((k) => [k, current[k as keyof Settings]])), after: patch }, ipHash: ip });
    revalidatePath("/admin/settings");
  }, "Settings saved");
}

export async function markAdminNotificationsReadAction() {
  await admin();
  return wrap(async () => {
    await prisma.notification.updateMany({ where: { audience: "ADMIN", readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
  });
}

export async function sendBroadcastAction(input: BroadcastInput): Promise<BroadcastResult> {
  const admin = await requireAdmin();
  const r = await sendBroadcast(input, admin.id);
  if (r.ok) revalidatePath("/admin/push");
  return r;
}

// ───── Accounts created by an admin ─────

export async function createRestaurantAdminAction(input: AdminRestaurantInput): Promise<AdminFormResult> {
  const { user } = await admin();
  const r = await createRestaurantByAdmin(user.id, input);
  if (r.ok) revalidatePath("/admin/restaurants");
  return r;
}

export async function createCustomerAdminAction(input: AdminCustomerInput): Promise<AdminFormResult> {
  const { user } = await admin();
  const r = await createCustomerByAdmin(user.id, input);
  if (r.ok) revalidatePath("/admin/customers");
  return r;
}

/** One commission rate for the selected restaurants; empty = back to the platform default. */
export async function bulkCommissionAction(ids: string[], rate: string | null) {
  const { user } = await admin();
  return wrap(async () => {
    const { changed } = await setCommissionForRestaurants(user.id, ids, rate);
    for (const id of changed) await notifyRestaurant(id, { type: "COMMISSION_RATE", title: "Your commission rate was updated", body: "The new rate applies to future order requests only.", link: "/dashboard/billing" });
    revalidatePath("/admin/restaurants");
    return { changed: changed.length };
  }, "Commission updated");
}
