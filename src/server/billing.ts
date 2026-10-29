import "server-only";
import type { Invoice, InvoiceStatus } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { getSettings, renderTemplate, type Settings } from "./settings";
import { nextCounter } from "./counters";
import { notifyAdmins, notifyRestaurant } from "./notifications";
import { audit } from "./audit";
import { formatMoney } from "@/lib/money";
import { formatDate, periodBounds, periodLabel, previousPeriod } from "@/lib/utils";

export class BillingError extends Error {
  status = 400;
}

const OPEN_STATUSES: InvoiceStatus[] = ["ISSUED", "AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PARTIALLY_PAID", "OVERDUE", "DISPUTED", "ADJUSTED"];

export function outstanding(inv: Pick<Invoice, "totalDueCents" | "paidCents">) {
  return Math.max(0, inv.totalDueCents - inv.paidCents);
}

/** Derives the invoice status from its money state, pending payments, disputes and due date. */
export function deriveInvoiceStatus(
  inv: Pick<Invoice, "totalDueCents" | "paidCents" | "dueDate" | "status">,
  ctx: { pendingPayment: boolean; openDispute: boolean; now?: Date },
): InvoiceStatus {
  if (inv.status === "DRAFT") return "DRAFT";
  if (inv.paidCents >= inv.totalDueCents) return "PAID";
  if (ctx.openDispute) return "DISPUTED";
  if (ctx.pendingPayment) return "PAYMENT_SUBMITTED";
  const now = ctx.now ?? new Date();
  if (inv.dueDate < now) return "OVERDUE";
  if (inv.paidCents > 0) return "PARTIALLY_PAID";
  return "AWAITING_PAYMENT";
}

export async function refreshInvoiceStatus(tx: Tx, invoiceId: string, now = new Date()) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const pendingPayment = (await tx.payment.count({ where: { invoiceId, status: { in: ["SUBMITTED", "MORE_INFO_REQUESTED"] } } })) > 0;
  const openDispute = (await tx.commissionDispute.count({ where: { invoiceId, status: { in: ["OPEN", "UNDER_REVIEW"] } } })) > 0;
  const status = deriveInvoiceStatus(inv, { pendingPayment, openDispute, now });
  if (status !== inv.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  return status;
}

function templateVars(inv: Pick<Invoice, "number" | "period" | "totalDueCents" | "paidCents" | "dueDate">, extra: Record<string, string> = {}) {
  return { invoice: inv.number, period: periodLabel(inv.period), amount: formatMoney(outstanding(inv as Invoice)), dueDate: formatDate(inv.dueDate), ...extra };
}

/** Preview what an invoice for this restaurant & period would contain (no writes). */
export async function previewInvoice(restaurantId: string, period: string) {
  const events = await prisma.commissionEvent.findMany({ where: { restaurantId, status: "ACCRUED", invoiceId: null, period: { lte: period } }, orderBy: { createdAt: "asc" } });
  const adjustments = await prisma.commissionAdjustment.findMany({ where: { restaurantId, status: "APPROVED", invoiceId: null } });
  const grossSubtotalCents = events.reduce((s, e) => s + e.baseCents, 0);
  const grossCommissionCents = events.reduce((s, e) => s + e.commissionCents, 0);
  const adjustmentsCents = adjustments.reduce((s, a) => s + a.amountCents, 0);
  return { events, adjustments, grossSubtotalCents, grossCommissionCents, adjustmentsCents, totalCents: grossCommissionCents + adjustmentsCents };
}

/**
 * Generates and issues the monthly invoice for one restaurant. Idempotent per
 * (restaurant, period). Includes all un-invoiced ACCRUED commission events up
 * to and including the period (late acknowledgments roll into the next
 * invoice) and all approved, unapplied adjustments. A net credit is carried
 * forward as a documented adjustment instead of producing a negative invoice.
 */
export async function generateInvoice(restaurantId: string, period: string, actorId: string | null, settingsIn?: Settings) {
  const settings = settingsIn ?? (await getSettings());
  const { start, end } = periodBounds(period);
  if (end > new Date()) throw new BillingError("Cannot invoice a billing period that has not ended");

  return prisma.$transaction(async (tx) => {
    // serialize per-restaurant invoice generation
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"invoice:" + restaurantId}))`;
    const already = await tx.invoice.findUnique({ where: { restaurantId_period: { restaurantId, period } } });
    if (already) return { invoice: already, created: false };

    const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const events = await tx.commissionEvent.findMany({ where: { restaurantId, status: "ACCRUED", invoiceId: null, period: { lte: period } }, orderBy: { createdAt: "asc" }, include: { order: { select: { createdAt: true } } } });
    const adjustments = await tx.commissionAdjustment.findMany({ where: { restaurantId, status: "APPROVED", invoiceId: null }, orderBy: { createdAt: "asc" } });
    if (!events.length && !adjustments.length) return { invoice: null, created: false };

    const grossSubtotalCents = events.reduce((s, e) => s + e.baseCents, 0);
    const grossCommissionCents = events.reduce((s, e) => s + e.commissionCents, 0);
    const adjustmentsCents = adjustments.reduce((s, a) => s + a.amountCents, 0);
    const net = grossCommissionCents + adjustmentsCents;
    const totalDueCents = Math.max(0, net);
    const carryCredit = net < 0 ? net : 0;

    const year = new Date().getUTCFullYear();
    const seq = await nextCounter(tx, `invoice:${year}`);
    const number = `NN-INV-${year}-${String(seq).padStart(5, "0")}`;
    const now = new Date();
    const dueDate = new Date(now.getTime() + settings.invoiceDueDays * 86400_000);

    const invoice = await tx.invoice.create({
      data: {
        number,
        restaurantId,
        period,
        periodStart: start,
        periodEnd: new Date(end.getTime() - 1),
        orderCount: events.length,
        grossSubtotalCents,
        rateBps: restaurant.commissionRateBps ?? settings.defaultCommissionRateBps,
        grossCommissionCents,
        adjustmentsCents,
        previousCreditCents: adjustments.filter((a) => a.reason.startsWith("Credit carried forward")).reduce((s, a) => s + a.amountCents, 0),
        totalDueCents,
        status: totalDueCents === 0 ? "PAID" : "AWAITING_PAYMENT",
        issuedAt: now,
        dueDate,
        restaurantSnapshot: {
          businessName: restaurant.businessName,
          displayName: restaurant.displayName,
          address: restaurant.address,
          area: restaurant.area,
          city: restaurant.city,
          phone: restaurant.phone,
          email: restaurant.email,
        },
        paymentInstructions: settings.whish as object,
        remindersSent: ["issued"],
        lines: {
          create: [
            ...events.map((e) => ({
              kind: "ORDER",
              commissionEventId: e.id,
              orderReference: e.orderReference,
              orderDate: e.order.createdAt,
              description: `Order ${e.orderReference}`,
              subtotalCents: e.baseCents,
              rateBps: e.rateBps,
              amountCents: e.commissionCents,
              adjustmentStatus: "NONE",
            })),
            ...adjustments.map((a) => ({
              kind: a.amountCents < 0 ? "CREDIT" : "ADJUSTMENT",
              description: a.reason,
              subtotalCents: 0,
              amountCents: a.amountCents,
              adjustmentStatus: "APPROVED",
            })),
          ],
        },
      },
    });
    if (events.length) await tx.commissionEvent.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { status: "INVOICED", invoiceId: invoice.id } });
    if (adjustments.length) await tx.commissionAdjustment.updateMany({ where: { id: { in: adjustments.map((a) => a.id) } }, data: { invoiceId: invoice.id } });
    if (carryCredit < 0) {
      await tx.commissionAdjustment.create({
        data: { restaurantId, amountCents: carryCredit, reason: `Credit carried forward from ${number}`, status: "APPROVED", createdById: actorId ?? "system", approvedById: actorId ?? "system", approvedAt: now },
      });
    }
    await audit({ actorId, action: "invoice.generate", entityType: "invoice", entityId: invoice.id, data: { number, period, totalDueCents } }, tx);
    const t = renderTemplate(settings.templates.invoiceIssued, templateVars(invoice));
    await notifyRestaurant(restaurantId, { type: "INVOICE_ISSUED", ...t, link: `/dashboard/billing/${invoice.id}` }, tx);
    return { invoice, created: true };
  });
}

/** Generates invoices for every restaurant with billable activity for the period (default: previous month). */
export async function runMonthlyBilling(period = previousPeriod(), actorId: string | null = null) {
  const settings = await getSettings();
  const restaurantIds = new Set<string>();
  for (const r of await prisma.commissionEvent.findMany({ where: { status: "ACCRUED", invoiceId: null, period: { lte: period } }, select: { restaurantId: true }, distinct: ["restaurantId"] })) restaurantIds.add(r.restaurantId);
  for (const r of await prisma.commissionAdjustment.findMany({ where: { status: "APPROVED", invoiceId: null }, select: { restaurantId: true }, distinct: ["restaurantId"] })) restaurantIds.add(r.restaurantId);
  const results: { restaurantId: string; number?: string; created: boolean; error?: string }[] = [];
  for (const id of restaurantIds) {
    try {
      const { invoice, created } = await generateInvoice(id, period, actorId, settings);
      results.push({ restaurantId: id, number: invoice?.number, created });
    } catch (e) {
      results.push({ restaurantId: id, created: false, error: (e as Error).message });
    }
  }
  return results;
}

// ───── Payments ─────

export async function submitPayment(input: {
  restaurantId: string;
  invoiceId: string;
  userId: string;
  amountCents: number;
  paymentDate: Date;
  whishReference: string;
  evidenceAssetIds: string[];
}) {
  if (input.amountCents <= 0) throw new BillingError("Enter the amount you transferred");
  if (!input.whishReference.trim()) throw new BillingError("Enter the Whish transaction reference");
  if (input.paymentDate > new Date(Date.now() + 86400_000)) throw new BillingError("Payment date cannot be in the future");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: input.invoiceId, restaurantId: input.restaurantId } });
    if (!inv) throw new BillingError("Invoice not found");
    if (!OPEN_STATUSES.includes(inv.status) || outstanding(inv) === 0) throw new BillingError("This invoice has no outstanding balance");
    const assets = await tx.mediaAsset.findMany({ where: { id: { in: input.evidenceAssetIds }, restaurantId: input.restaurantId, kind: "RECEIPT" } });
    if (assets.length !== input.evidenceAssetIds.length) throw new BillingError("Invalid receipt upload");
    const dupRef = await tx.payment.findFirst({ where: { whishReference: input.whishReference.trim(), status: { not: "REJECTED" } } });
    if (dupRef) throw new BillingError("This Whish reference has already been submitted");
    const payment = await tx.payment.create({
      data: {
        invoiceId: inv.id,
        restaurantId: input.restaurantId,
        amountCents: input.amountCents,
        paymentDate: input.paymentDate,
        whishReference: input.whishReference.trim(),
        submittedById: input.userId,
        evidence: { create: assets.map((a) => ({ assetId: a.id })) },
      },
    });
    await refreshInvoiceStatus(tx, inv.id);
    await audit({ actorId: input.userId, action: "payment.submit", entityType: "payment", entityId: payment.id, data: { invoice: inv.number, amountCents: input.amountCents } }, tx);
    await notifyAdmins({ type: "PAYMENT_SUBMITTED", title: `Whish payment submitted for ${inv.number}`, body: `${formatMoney(input.amountCents)} · ref ${input.whishReference}`, link: `/admin/payments?id=${payment.id}` }, tx);
    return payment;
  });
}

export type PaymentReview = { action: "APPROVE"; verifiedAmountCents: number; note?: string } | { action: "REJECT" | "MORE_INFO"; note: string };

/** Admin reconciliation. Approval requires independently confirming receipt of funds. */
export async function reviewPayment(adminId: string, paymentId: string, review: PaymentReview) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true } });
    if (p.status === "APPROVED" || p.status === "REJECTED") throw new BillingError("This payment has already been reviewed");
    const now = new Date();
    if (review.action === "APPROVE") {
      if (!Number.isInteger(review.verifiedAmountCents) || review.verifiedAmountCents <= 0) throw new BillingError("Enter the verified amount received");
      await tx.payment.update({ where: { id: p.id }, data: { status: "APPROVED", verifiedAmountCents: review.verifiedAmountCents, reviewNote: review.note, reviewedById: adminId, reviewedAt: now } });
      await tx.invoice.update({ where: { id: p.invoiceId }, data: { paidCents: { increment: review.verifiedAmountCents } } });
    } else {
      if (!review.note?.trim()) throw new BillingError("Add a note for the restaurant");
      await tx.payment.update({ where: { id: p.id }, data: { status: review.action === "REJECT" ? "REJECTED" : "MORE_INFO_REQUESTED", reviewNote: review.note, reviewedById: adminId, reviewedAt: now } });
    }
    await refreshInvoiceStatus(tx, p.invoiceId);
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: p.invoiceId } });
    await audit({ actorId: adminId, action: `payment.${review.action.toLowerCase()}`, entityType: "payment", entityId: p.id, data: { invoice: inv.number, ...review } }, tx);
    const tpl = review.action === "APPROVE" ? settings.templates.paymentApproved : review.action === "REJECT" ? settings.templates.paymentRejected : settings.templates.paymentMoreInfo;
    const amount = review.action === "APPROVE" ? formatMoney(review.verifiedAmountCents) : formatMoney(p.amountCents);
    const t = renderTemplate(tpl, { ...templateVars(inv), amount, note: review.note ?? "" });
    await notifyRestaurant(p.restaurantId, { type: `PAYMENT_${review.action}`, ...t, link: `/dashboard/billing/${inv.id}` }, tx, { email: true });
    return inv;
  });
}

/** Admin records funds received outside a restaurant submission (e.g. reconciled from the Whish statement). */
export async function recordManualPayment(adminId: string, invoiceId: string, amountCents: number, reference: string, note: string) {
  if (amountCents <= 0) throw new BillingError("Amount must be positive");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const p = await tx.payment.create({
      data: { invoiceId, restaurantId: inv.restaurantId, amountCents, verifiedAmountCents: amountCents, paymentDate: new Date(), whishReference: reference || `MANUAL-${Date.now()}`, status: "APPROVED", reviewNote: note, reviewedById: adminId, reviewedAt: new Date(), method: "WHISH_MANUAL" },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { paidCents: { increment: amountCents } } });
    await refreshInvoiceStatus(tx, invoiceId);
    await audit({ actorId: adminId, action: "payment.manual_record", entityType: "payment", entityId: p.id, data: { invoice: inv.number, amountCents, reference, note } }, tx);
    await notifyRestaurant(inv.restaurantId, { type: "PAYMENT_APPROVE", title: `Payment recorded for ${inv.number}`, body: `${formatMoney(amountCents)} was reconciled against your invoice.`, link: `/dashboard/billing/${inv.id}` }, tx);
    return p;
  });
}

// ───── Adjustments & disputes ─────

export async function createAdjustment(adminId: string, input: { restaurantId: string; amountCents: number; reason: string; commissionEventId?: string | null; approve: boolean }) {
  if (!input.reason.trim()) throw new BillingError("A reason is required");
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new BillingError("Amount must be a non-zero value");
  const adj = await prisma.commissionAdjustment.create({
    data: {
      restaurantId: input.restaurantId,
      amountCents: input.amountCents,
      reason: input.reason.trim(),
      commissionEventId: input.commissionEventId || null,
      createdById: adminId,
      status: input.approve ? "APPROVED" : "PENDING",
      approvedById: input.approve ? adminId : null,
      approvedAt: input.approve ? new Date() : null,
    },
  });
  await audit({ actorId: adminId, action: "adjustment.create", entityType: "commission_adjustment", entityId: adj.id, data: input });
  return adj;
}

export async function decideAdjustment(adminId: string, id: string, approve: boolean) {
  const adj = await prisma.commissionAdjustment.findUniqueOrThrow({ where: { id } });
  if (adj.status !== "PENDING") throw new BillingError("Adjustment already decided");
  if (approve && adj.createdById === adminId && process.env.REQUIRE_FOUR_EYES === "true") throw new BillingError("Another administrator must approve this adjustment");
  await prisma.commissionAdjustment.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approvedById: adminId, approvedAt: new Date() } });
  await audit({ actorId: adminId, action: approve ? "adjustment.approve" : "adjustment.reject", entityType: "commission_adjustment", entityId: id });
}

/**
 * Applies an approved, unapplied adjustment to an already-issued open invoice
 * as a documented credit/debit note line (the original lines are untouched).
 */
export async function applyAdjustmentToInvoice(adminId: string, adjustmentId: string, invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const adj = await tx.commissionAdjustment.findUniqueOrThrow({ where: { id: adjustmentId } });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (adj.status !== "APPROVED" || adj.invoiceId) throw new BillingError("Adjustment must be approved and not yet applied");
    if (adj.restaurantId !== inv.restaurantId) throw new BillingError("Adjustment belongs to a different restaurant");
    if (inv.status === "PAID" || inv.status === "DRAFT") throw new BillingError("Only open invoices can be adjusted");
    const newTotal = Math.max(inv.paidCents, inv.totalDueCents + adj.amountCents);
    const applied = newTotal - inv.totalDueCents;
    await tx.invoiceLine.create({ data: { invoiceId, kind: adj.amountCents < 0 ? "CREDIT" : "ADJUSTMENT", description: `${adj.amountCents < 0 ? "Credit note" : "Debit note"}: ${adj.reason}`, subtotalCents: 0, amountCents: applied, adjustmentStatus: "APPROVED" } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { totalDueCents: newTotal, adjustmentsCents: { increment: applied } } });
    await tx.commissionAdjustment.update({ where: { id: adjustmentId }, data: { invoiceId } });
    if (applied !== adj.amountCents) {
      await tx.commissionAdjustment.create({ data: { restaurantId: adj.restaurantId, amountCents: adj.amountCents - applied, reason: `Remaining credit from adjustment on ${inv.number}`, status: "APPROVED", createdById: adminId, approvedById: adminId, approvedAt: new Date() } });
    }
    await refreshInvoiceStatus(tx, invoiceId);
    await audit({ actorId: adminId, action: "invoice.apply_adjustment", entityType: "invoice", entityId: invoiceId, data: { adjustmentId, applied } }, tx);
    await notifyRestaurant(inv.restaurantId, { type: "INVOICE_ADJUSTED", title: `Invoice ${inv.number} adjusted`, body: `${formatMoney(applied)} — ${adj.reason}`, link: `/dashboard/billing/${inv.id}` }, tx);
  });
}

export async function openDispute(input: { restaurantId: string; userId: string; commissionEventId?: string | null; invoiceId?: string | null; reason: string; details?: string; evidenceUrls?: string[] }) {
  const settings = await getSettings();
  if (!input.reason.trim()) throw new BillingError("Select a reason");
  return prisma.$transaction(async (tx) => {
    let invoiceId = input.invoiceId ?? null;
    if (input.commissionEventId) {
      const ev = await tx.commissionEvent.findFirst({ where: { id: input.commissionEventId, restaurantId: input.restaurantId } });
      if (!ev) throw new BillingError("Commission entry not found");
      if (ev.status === "VOIDED") throw new BillingError("This entry was already voided");
      const open = await tx.commissionDispute.findFirst({ where: { commissionEventId: ev.id, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
      if (open) throw new BillingError("A dispute is already open for this order");
      const deadlineBase = ev.invoiceId ? (await tx.invoice.findUniqueOrThrow({ where: { id: ev.invoiceId } })).issuedAt ?? ev.createdAt : ev.createdAt;
      if (Date.now() - deadlineBase.getTime() > settings.disputeWindowDays * 86400_000) throw new BillingError(`Disputes must be opened within ${settings.disputeWindowDays} days`);
      if (ev.status === "ACCRUED") await tx.commissionEvent.update({ where: { id: ev.id }, data: { status: "DISPUTED" } });
      invoiceId = ev.invoiceId ?? invoiceId;
    } else if (invoiceId) {
      const inv = await tx.invoice.findFirst({ where: { id: invoiceId, restaurantId: input.restaurantId } });
      if (!inv) throw new BillingError("Invoice not found");
      if (Date.now() - (inv.issuedAt ?? inv.createdAt).getTime() > settings.disputeWindowDays * 86400_000) throw new BillingError(`Disputes must be opened within ${settings.disputeWindowDays} days of issue`);
    } else throw new BillingError("Select an order or invoice to dispute");

    const d = await tx.commissionDispute.create({
      data: { restaurantId: input.restaurantId, commissionEventId: input.commissionEventId || null, invoiceId, reason: input.reason, details: input.details?.slice(0, 2000), evidenceUrls: input.evidenceUrls ?? [], createdById: input.userId },
    });
    if (input.commissionEventId) {
      const ev = await tx.commissionEvent.findUniqueOrThrow({ where: { id: input.commissionEventId } });
      await tx.orderEvent.create({ data: { orderId: ev.orderId, type: "COMMISSION_DISPUTED", actorType: "RESTAURANT", actorId: input.userId, data: { reason: input.reason } } });
    }
    if (invoiceId) await refreshInvoiceStatus(tx, invoiceId);
    await audit({ actorId: input.userId, action: "dispute.open", entityType: "commission_dispute", entityId: d.id, data: { reason: input.reason } }, tx);
    await notifyAdmins({ type: "DISPUTE_OPENED", title: "New commission dispute", body: input.reason, link: `/admin/disputes?id=${d.id}` }, tx);
    return d;
  });
}

export async function resolveDispute(adminId: string, disputeId: string, accept: boolean, resolution: string) {
  if (!resolution.trim()) throw new BillingError("Explain the resolution");
  return prisma.$transaction(async (tx) => {
    const d = await tx.commissionDispute.findUniqueOrThrow({ where: { id: disputeId }, include: { commissionEvent: true } });
    if (d.status === "ACCEPTED" || d.status === "REJECTED") throw new BillingError("Dispute already resolved");
    await tx.commissionDispute.update({ where: { id: d.id }, data: { status: accept ? "ACCEPTED" : "REJECTED", resolution, resolvedById: adminId, resolvedAt: new Date() } });
    const ev = d.commissionEvent;
    if (ev) {
      if (accept) {
        if (ev.status === "DISPUTED") {
          await tx.commissionEvent.update({ where: { id: ev.id }, data: { status: "VOIDED" } });
        } else if (ev.status === "INVOICED") {
          // invoiced entries are corrected with a documented credit, never by editing the invoice
          await tx.commissionAdjustment.create({ data: { restaurantId: d.restaurantId, commissionEventId: ev.id, amountCents: -ev.commissionCents, reason: `Dispute accepted for order ${ev.orderReference}`, status: "APPROVED", createdById: adminId, approvedById: adminId, approvedAt: new Date() } });
          await tx.invoiceLine.updateMany({ where: { commissionEventId: ev.id }, data: { adjustmentStatus: "CREDITED" } });
        }
      } else if (ev.status === "DISPUTED") {
        await tx.commissionEvent.update({ where: { id: ev.id }, data: { status: "ACCRUED" } });
      }
    }
    if (d.invoiceId) await refreshInvoiceStatus(tx, d.invoiceId);
    await audit({ actorId: adminId, action: accept ? "dispute.accept" : "dispute.reject", entityType: "commission_dispute", entityId: d.id, data: { resolution } }, tx);
    await notifyRestaurant(d.restaurantId, { type: "DISPUTE_RESOLVED", title: `Dispute ${accept ? "accepted" : "rejected"}`, body: resolution, link: "/dashboard/billing" }, tx);
  });
}

// ───── Reminders & overdue policy ─────

export async function runBillingMaintenance(now = new Date()) {
  const settings = await getSettings();
  const open = await prisma.invoice.findMany({ where: { status: { in: ["AWAITING_PAYMENT", "PARTIALLY_PAID", "OVERDUE", "PAYMENT_SUBMITTED", "DISPUTED", "ADJUSTED", "ISSUED"] } } });
  const summary = { refreshed: 0, reminders: 0, restricted: 0 };
  for (const inv of open) {
    const status = await prisma.$transaction((tx) => refreshInvoiceStatus(tx, inv.id, now));
    summary.refreshed++;
    const daysToDue = Math.floor((inv.dueDate.getTime() - now.getTime()) / 86400_000);
    const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400_000);
    const sent = new Set(inv.remindersSent);
    const toSend: { key: string; tpl: keyof Settings["templates"] }[] = [];
    if (["AWAITING_PAYMENT", "PARTIALLY_PAID"].includes(status)) {
      if (daysToDue <= settings.reminders.daysBeforeDue && daysToDue > 0) toSend.push({ key: `before-${settings.reminders.daysBeforeDue}`, tpl: "paymentDue" });
      if (settings.reminders.onDue && daysToDue === 0) toSend.push({ key: "due", tpl: "paymentDue" });
    }
    if (status === "OVERDUE") {
      for (const d of settings.reminders.daysAfterDue) if (daysOverdue >= d) toSend.push({ key: `after-${d}`, tpl: "invoiceOverdue" });
      if (!sent.has("overdue-admin")) {
        await notifyAdmins({ type: "INVOICE_OVERDUE", title: `Invoice ${inv.number} is overdue`, body: formatMoney(outstanding(inv)), link: `/admin/invoices/${inv.id}` });
        toSend.push({ key: "overdue-admin", tpl: "invoiceOverdue" });
      }
    }
    const fresh = toSend.filter((t) => !sent.has(t.key));
    for (const t of fresh) {
      if (t.key !== "overdue-admin") {
        const msg = renderTemplate(settings.templates[t.tpl], templateVars(inv));
        await notifyRestaurant(inv.restaurantId, { type: t.tpl === "invoiceOverdue" ? "INVOICE_OVERDUE" : "PAYMENT_DUE", ...msg, link: `/dashboard/billing/${inv.id}` }, undefined, { email: true });
        summary.reminders++;
      }
      sent.add(t.key);
    }
    if (fresh.length) await prisma.invoice.update({ where: { id: inv.id }, data: { remindersSent: Array.from(sent) } });

    // Overdue restrictions: only when configured, only for genuinely overdue invoices
    // (never while a payment awaits verification or a dispute is open).
    if (settings.overduePolicy.autoApply && status === "OVERDUE" && daysOverdue > settings.graceDays) {
      const p = settings.overduePolicy;
      const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: inv.restaurantId } });
      const data: { restrictPromotion?: boolean; restrictReels?: boolean; status?: "SUSPENDED"; suspendedReason?: string } = {};
      if (daysOverdue >= p.restrictPromotionAfterDays && !r.restrictPromotion) data.restrictPromotion = true;
      if (daysOverdue >= p.restrictReelsAfterDays && !r.restrictReels) data.restrictReels = true;
      if (daysOverdue >= p.suspendAfterDays && r.status === "ACTIVE") {
        data.status = "SUSPENDED";
        data.suspendedReason = `Overdue invoice ${inv.number}`;
      }
      if (Object.keys(data).length) {
        await prisma.restaurant.update({ where: { id: r.id }, data });
        await audit({ actorId: null, action: "restaurant.overdue_restriction", entityType: "restaurant", entityId: r.id, data: { invoice: inv.number, ...data } });
        await notifyRestaurant(r.id, { type: "ACCOUNT_WARNING", title: "Account restricted due to overdue invoice", body: `Settle ${inv.number} to lift restrictions.`, link: `/dashboard/billing/${inv.id}` }, undefined, { email: true });
        summary.restricted++;
      }
    }
  }
  return summary;
}

export async function restaurantBillingSummary(restaurantId: string) {
  const settings = await getSettings();
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const accrued = await prisma.commissionEvent.aggregate({ where: { restaurantId, status: "ACCRUED", invoiceId: null }, _sum: { commissionCents: true, baseCents: true }, _count: true });
  const current = await prisma.commissionEvent.aggregate({ where: { restaurantId, period: currentPeriod, status: { in: ["ACCRUED", "DISPUTED"] } }, _sum: { commissionCents: true, baseCents: true }, _count: true });
  const openInvoices = await prisma.invoice.findMany({ where: { restaurantId, status: { in: OPEN_STATUSES } }, orderBy: { issuedAt: "asc" } });
  const outstandingCents = openInvoices.reduce((s, i) => s + outstanding(i), 0);
  const lastInvoice = await prisma.invoice.findFirst({ where: { restaurantId }, orderBy: { createdAt: "desc" } });
  return {
    settings,
    currentPeriod,
    currentEstimateCents: current._sum.commissionCents ?? 0,
    currentSubtotalCents: current._sum.baseCents ?? 0,
    currentCount: current._count,
    uninvoicedCents: accrued._sum.commissionCents ?? 0,
    outstandingCents,
    openInvoices,
    lastInvoice,
    nextDue: openInvoices.find((i) => outstanding(i) > 0)?.dueDate ?? null,
  };
}
