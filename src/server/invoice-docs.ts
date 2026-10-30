import "server-only";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Invoice, InvoiceLine, Payment } from "@prisma/client";
import { formatMoney, formatRate } from "@/lib/money";
import { formatDate, periodLabel } from "@/lib/utils";
import { drawLogo } from "./pdf-logo";

type FullInvoice = Invoice & { lines: InvoiceLine[]; payments: Payment[] };

/** WinAnsi-safe text for the standard PDF fonts (Arabic names are transliterated as '?'). */
function safe(s: string | null | undefined) {
  return (s ?? "").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7E -ÿ]/g, "?");
}

export function statementCsv(inv: FullInvoice) {
  const rows = inv.lines.map((l) => ({
    type: l.kind,
    order_reference: l.orderReference ?? "",
    order_date: l.orderDate ? l.orderDate.toISOString().slice(0, 10) : "",
    description: l.description,
    order_subtotal_usd: (l.subtotalCents / 100).toFixed(2),
    commission_rate: l.rateBps != null ? formatRate(l.rateBps) : "",
    amount_usd: (l.amountCents / 100).toFixed(2),
    adjustment_status: l.adjustmentStatus ?? "",
  }));
  return "﻿" + Papa.unparse(rows);
}

export async function invoicePdf(inv: FullInvoice, platformName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.number}`);
  pdf.setAuthor(platformName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(1, 0.33, 0.07);
  const ink = rgb(0.09, 0.07, 0.06);
  const muted = rgb(0.48, 0.44, 0.42);
  const W = 595.28, H = 841.89, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10, f = o.f ?? font;
    const s = safe(t);
    page.drawText(s, { x: o.right ? x - f.widthOfTextAtSize(s, size) : x, y: yy, size, font: f, color: o.color ?? ink });
  };
  const snap = inv.restaurantSnapshot as Record<string, string | null>;
  const pay = inv.paymentInstructions as Record<string, string>;

  drawLogo(page, M, y + 22, 40, brand);
  text("COMMISSION INVOICE", W - M, y + 4, { size: 12, f: bold, right: true });
  y -= 18;
  text(`Invoice ${inv.number}`, W - M, y, { right: true, color: muted });
  y -= 14;
  text(`Issued ${inv.issuedAt ? formatDate(inv.issuedAt) : "-"}  ·  Due ${formatDate(inv.dueDate)}`, W - M, y, { right: true, color: muted });
  y -= 30;

  text("BILLED TO", M, y, { size: 8, f: bold, color: muted });
  text("BILLING PERIOD", W / 2, y, { size: 8, f: bold, color: muted });
  y -= 14;
  text(snap.businessName ?? "", M, y, { f: bold });
  text(periodLabel(inv.period), W / 2, y, { f: bold });
  y -= 13;
  if (snap.displayName && snap.displayName !== snap.businessName) {
    text(snap.displayName, M, y, { color: muted });
    y -= 13;
  }
  for (const l of [snap.address, [snap.area, snap.city].filter(Boolean).join(", "), snap.phone ? `+${snap.phone}` : null, snap.email].filter(Boolean) as string[]) {
    text(l, M, y, { color: muted });
    y -= 13;
  }
  y -= 14;

  // Summary box
  const summary: [string, string][] = [
    ["Commissionable order requests", String(inv.orderCount)],
    ["Gross eligible order subtotal", formatMoney(inv.grossSubtotalCents)],
    ["Commission rate", formatRate(inv.rateBps)],
    ["Gross commission", formatMoney(inv.grossCommissionCents)],
    ["Approved adjustments & credits", formatMoney(inv.adjustmentsCents)],
    ...(inv.previousCreditCents ? ([["  of which previous credits", formatMoney(inv.previousCreditCents)]] as [string, string][]) : []),
    ["Paid to date", formatMoney(inv.paidCents)],
  ];
  page.drawRectangle({ x: M, y: y - summary.length * 16 - 34, width: W - 2 * M, height: summary.length * 16 + 44, color: rgb(0.98, 0.97, 0.96) });
  y -= 6;
  for (const [k, v] of summary) {
    text(k, M + 12, y);
    text(v, W - M - 12, y, { right: true });
    y -= 16;
  }
  y -= 4;
  text("AMOUNT DUE", M + 12, y, { f: bold, size: 12 });
  text(formatMoney(Math.max(0, inv.totalDueCents - inv.paidCents)), W - M - 12, y, { f: bold, size: 12, right: true, color: brand });
  y -= 22;
  text(`Status: ${inv.status.replace(/_/g, " ").toLowerCase()}`, M + 12, y, { color: muted, size: 9 });
  y -= 30;

  text("PAYMENT INSTRUCTIONS (WHISH MONEY / WHISH PAY)", M, y, { size: 8, f: bold, color: muted });
  y -= 14;
  for (const l of [pay.recipientName && `Recipient: ${pay.recipientName}`, pay.whishNumber && `Whish number: ${pay.whishNumber}`, pay.accountId && `Account ID: ${pay.accountId}`, `Reference: ${inv.number}`].filter(Boolean) as string[]) {
    text(l, M, y);
    y -= 13;
  }
  if (pay.instructions) {
    const words = safe(pay.instructions).split(" ");
    let line = "";
    for (const w of words) {
      if (font.widthOfTextAtSize(line + " " + w, 9) > W - 2 * M) {
        text(line, M, y, { size: 9, color: muted });
        y -= 12;
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) {
      text(line, M, y, { size: 9, color: muted });
      y -= 12;
    }
  }
  y -= 18;

  // Itemized statement
  const header = () => {
    text("ITEMIZED STATEMENT", M, y, { size: 8, f: bold, color: muted });
    y -= 16;
    const cols = [M, M + 120, M + 200, W - M - 170, W - M - 90, W - M];
    text("Reference", cols[0], y, { f: bold, size: 9 });
    text("Date", cols[1], y, { f: bold, size: 9 });
    text("Description", cols[2], y, { f: bold, size: 9 });
    text("Subtotal", cols[3] + 60, y, { f: bold, size: 9, right: true });
    text("Rate", cols[4] + 30, y, { f: bold, size: 9, right: true });
    text("Amount", cols[5], y, { f: bold, size: 9, right: true });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: muted });
    y -= 12;
  };
  header();
  for (const l of inv.lines) {
    if (y < M + 30) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    text(l.orderReference ?? "-", M, y, { size: 9 });
    text(l.orderDate ? formatDate(l.orderDate) : "-", M + 120, y, { size: 9 });
    text((l.kind === "ORDER" ? (l.adjustmentStatus === "CREDITED" ? "Order (credited)" : "Order") : l.description).slice(0, 40), M + 200, y, { size: 9 });
    text(l.subtotalCents ? formatMoney(l.subtotalCents) : "", W - M - 110, y, { size: 9, right: true });
    text(l.rateBps != null ? formatRate(l.rateBps) : "", W - M - 60, y, { size: 9, right: true });
    text(formatMoney(l.amountCents), W - M, y, { size: 9, right: true });
    y -= 14;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`${platformName} · ${inv.number} · Page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 8, font, color: muted });
  });
  return pdf.save();
}
