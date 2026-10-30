import "server-only";
import { prisma } from "./db";
import { DEFAULT_RANK_WEIGHTS, type RankWeights } from "@/lib/ranking";

export type BillableEvent = "ACCEPTED" | "COMPLETED";

export type WhishSettings = {
  recipientName: string;
  whishNumber: string;
  accountId: string;
  instructions: string;
};

export type NotificationTemplate = { title: string; body: string };

export type Settings = {
  platformName: string;
  tagline: string;
  supportEmail: string;
  defaultCommissionRateBps: number;
  billableEvent: BillableEvent;
  autoCompleteHours: number; // accepted orders not closed by the restaurant are completed automatically
  agreementVersion: string;
  minViewMs: number;
  viewDedupeMinutes: number;
  invoiceDueDays: number;
  graceDays: number;
  disputeWindowDays: number;
  lbpPerUsd: number;
  supportedCurrencies: string[];
  whish: WhishSettings;
  reminders: { onIssue: boolean; daysBeforeDue: number; onDue: boolean; daysAfterDue: number[] };
  overduePolicy: {
    autoApply: boolean;
    restrictPromotionAfterDays: number;
    restrictReelsAfterDays: number;
    suspendAfterDays: number;
  };
  requireRestaurantApproval: boolean;
  feedWeights: RankWeights;
  suspiciousRejectRate: number;
  templates: Record<"invoiceIssued" | "paymentDue" | "paymentApproved" | "paymentRejected" | "invoiceOverdue" | "paymentMoreInfo", NotificationTemplate>;
};

export const DEFAULT_SETTINGS: Settings = {
  platformName: "numnum",
  tagline: "Watch it. Crave it. Order it.",
  supportEmail: "support@numnum.app",
  defaultCommissionRateBps: 1400,
  billableEvent: "COMPLETED",
  autoCompleteHours: 6,
  agreementVersion: "2026-10",
  minViewMs: 2000,
  viewDedupeMinutes: 30,
  invoiceDueDays: 10,
  graceDays: 7,
  disputeWindowDays: 14,
  lbpPerUsd: 89500,
  supportedCurrencies: ["USD", "LBP"],
  whish: { recipientName: "", whishNumber: "", accountId: "", instructions: "Send the exact amount due via Whish Money and include the invoice number in the transfer note." },
  reminders: { onIssue: true, daysBeforeDue: 3, onDue: true, daysAfterDue: [3, 7] },
  overduePolicy: { autoApply: false, restrictPromotionAfterDays: 7, restrictReelsAfterDays: 15, suspendAfterDays: 30 },
  requireRestaurantApproval: true,
  feedWeights: DEFAULT_RANK_WEIGHTS,
  suspiciousRejectRate: 0.6,
  templates: {
    invoiceIssued: { title: "Invoice {{invoice}} issued", body: "Your commission invoice for {{period}} is {{amount}}, due {{dueDate}}." },
    paymentDue: { title: "Payment due soon: {{invoice}}", body: "{{amount}} is due on {{dueDate}}. Pay via Whish from Billing & Commissions." },
    invoiceOverdue: { title: "Invoice {{invoice}} is overdue", body: "{{amount}} was due on {{dueDate}}. Please settle it to avoid account restrictions." },
    paymentApproved: { title: "Payment approved for {{invoice}}", body: "We verified your Whish payment of {{amount}}. Thank you!" },
    paymentRejected: { title: "Payment not verified for {{invoice}}", body: "We could not verify your payment. Reason: {{note}}" },
    paymentMoreInfo: { title: "More information needed for {{invoice}}", body: "Please provide additional evidence: {{note}}" },
  },
};

function merge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out as T;
}

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.platformSetting.findMany();
  let s: Settings = DEFAULT_SETTINGS;
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) s = { ...s, [r.key]: merge((DEFAULT_SETTINGS as Record<string, unknown>)[r.key], r.value) };
  }
  return s;
}

export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K], userId: string) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as object, updatedBy: userId },
    update: { value: value as object, updatedBy: userId },
  });
}

export function renderTemplate(t: NotificationTemplate, vars: Record<string, string>): NotificationTemplate {
  const r = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  return { title: r(t.title), body: r(t.body) };
}
