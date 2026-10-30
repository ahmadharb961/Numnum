import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Insights } from "./insights";
import { formatMoney } from "@/lib/money";
import { STATUS_META } from "@/lib/order-status";
import { drawLogo } from "./pdf-logo";

const safe = (s: string | null | undefined) => (s ?? "").replace(/[^\x20-\x7E -ÿ]/g, "?");

/** Multi-page A4 insights report: KPIs, daily revenue chart + table, top items, top reels, order history. */
export async function insightsPdf(ins: Insights, platformName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${ins.restaurant.displayName} insights — ${ins.range.label}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(1, 0.33, 0.07), ink = rgb(0.09, 0.07, 0.06), muted = rgb(0.48, 0.44, 0.42), line = rgb(0.9, 0.88, 0.86);
  const W = 595.28, H = 841.89, M = 44;
  const cur = ins.restaurant.currency;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font, s = safe(t);
    page.drawText(s, { x: o.right ? x - f.widthOfTextAtSize(s, size) : x, y: yy, size, font: f, color: o.color ?? ink });
  };
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 10;
    text(t.toUpperCase(), M, y, { size: 8.5, f: bold, color: muted });
    y -= 14;
  };

  drawLogo(page, M, y + 16, 20, brand);
  text("INSIGHTS REPORT", W - M, y + 3, { size: 11, f: bold, right: true });
  y -= 18;
  text(ins.restaurant.displayName, M, y, { size: 13, f: bold });
  text(`${ins.range.label} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, W - M, y, { right: true, color: muted });
  y -= 26;

  const k = ins.kpis;
  const tiles: [string, string][] = [
    ["Revenue (completed)", formatMoney(k.revenueCents, cur)],
    ["Orders placed", String(k.ordersPlaced)],
    ["Completed", String(k.ordersCompleted)],
    ["Avg. order", formatMoney(k.avgOrderCents, cur)],
    ["Profile visits", String(k.profileVisits)],
    ["Unique visitors", String(k.uniqueVisitors)],
    ["Reel views", String(k.reelViews)],
    ["Visit to order", k.conversion != null ? `${(k.conversion * 100).toFixed(1)}%` : "-"],
    ["Rejected / canceled", `${k.ordersRejected} / ${k.ordersCanceled}`],
    ["Not delivered", String(k.ordersFailed)],
    ["Delivery fees", formatMoney(k.deliveryFeesCents, cur)],
    ["Commission", formatMoney(k.commissionCents)],
  ];
  const tw = (W - 2 * M - 18) / 4;
  tiles.forEach(([l, v], i) => {
    const cx = M + (i % 4) * (tw + 6), cy = y - Math.floor(i / 4) * 46;
    page.drawRectangle({ x: cx, y: cy - 38, width: tw, height: 40, color: rgb(0.98, 0.97, 0.96) });
    text(l, cx + 8, cy - 12, { size: 7.5, color: muted });
    text(v, cx + 8, cy - 29, { size: 12, f: bold });
  });
  y -= 46 * 3 + 6;

  // Daily revenue bars (single series, one scale)
  heading("Daily revenue (completed orders)");
  const chartH = 110, chartW = W - 2 * M;
  const max = Math.max(1, ...ins.days.map((d) => d.revenueCents));
  const bw = chartW / ins.days.length;
  page.drawLine({ start: { x: M, y: y - chartH }, end: { x: W - M, y: y - chartH }, thickness: 0.6, color: line });
  ins.days.forEach((d, i) => {
    const h = (d.revenueCents / max) * (chartH - 12);
    if (h > 0) page.drawRectangle({ x: M + i * bw + Math.min(1, bw * 0.1), y: y - chartH, width: Math.max(0.8, bw - Math.min(2, bw * 0.2)), height: h, color: brand });
    if (i % Math.ceil(ins.days.length / 8) === 0) text(d.date.slice(5), M + i * bw, y - chartH - 11, { size: 7, color: muted });
  });
  text(`max ${formatMoney(max, cur)}/day`, W - M, y - 2, { size: 7.5, color: muted, right: true });
  y -= chartH + 22;

  heading("Top-selling items");
  if (!ins.topItems.length) {
    text("No completed orders in this period.", M, y, { color: muted });
    y -= 14;
  }
  ins.topItems.forEach((t, i) => {
    ensure(14);
    text(`${i + 1}. ${t.name}`, M, y);
    text(`${t.quantity} sold`, W - M - 90, y, { right: true });
    text(formatMoney(t.salesCents, cur), W - M, y, { right: true, f: bold });
    y -= 14;
  });

  heading("Most viewed reels");
  if (!ins.topReels.length) {
    text("No reel views in this period.", M, y, { color: muted });
    y -= 14;
  }
  ins.topReels.forEach((r, i) => {
    ensure(14);
    text(`${i + 1}. ${r.menuItem.name}`, M, y);
    text(`${r.views} views · ${r.likeCount} likes · ${r.orderInits} orders`, W - M, y, { right: true });
    y -= 14;
  });

  heading("Reels performance");
  if (!ins.reels.length) {
    text("No published reels.", M, y, { color: muted });
    y -= 14;
  } else {
    const rc = [M, M + 190, M + 240, M + 290, M + 335, M + 385, M + 430, W - M];
    const rhead = () => {
      ["Reel", "Views", "Unique", "Likes", "Opens", "Carts", "Orders"].forEach((h, i) => text(h, rc[i], y, { f: bold, size: 8.5 }));
      text("Revenue", rc[7], y, { f: bold, size: 8.5, right: true });
      y -= 12;
    };
    rhead();
    for (const r of ins.reels) {
      if (y < M + 14) {
        page = pdf.addPage([W, H]);
        y = H - M;
        rhead();
      }
      text(r.name.slice(0, 34), rc[0], y, { size: 8.5 });
      [r.views, r.uniqueViewers, r.likes, r.productOpens, r.addToCarts, r.orders].forEach((v, i) => text(String(v), rc[i + 1], y, { size: 8.5 }));
      text(formatMoney(r.revenueCents, cur), rc[7], y, { size: 8.5, right: true });
      y -= 11;
    }
  }

  heading("Daily breakdown");
  const cols = [M, M + 90, M + 190, M + 290, W - M];
  const head = () => {
    ["Date", "Profile visits", "Reel views", "Orders"].forEach((h, i) => text(h, cols[i], y, { f: bold, size: 8.5 }));
    text("Revenue", cols[4], y, { f: bold, size: 8.5, right: true });
    y -= 12;
  };
  head();
  for (const d of ins.days) {
    if (y < M + 14) {
      page = pdf.addPage([W, H]);
      y = H - M;
      head();
    }
    text(d.date, cols[0], y, { size: 8.5 });
    text(String(d.visits), cols[1], y, { size: 8.5 });
    text(String(d.reelViews), cols[2], y, { size: 8.5 });
    text(String(d.orders), cols[3], y, { size: 8.5 });
    text(formatMoney(d.revenueCents, cur), cols[4], y, { size: 8.5, right: true });
    y -= 11;
  }

  heading(`Order history (${ins.orders.length})`);
  const ocols = [M, M + 95, M + 190, M + 270, M + 330, W - M - 70, W - M];
  const ohead = () => {
    ["Date", "Order", "Customer", "Type", "Items"].forEach((h, i) => text(h, ocols[i], y, { f: bold, size: 8.5 }));
    text("Total", ocols[5], y, { f: bold, size: 8.5, right: true });
    text("Status", ocols[6], y, { f: bold, size: 8.5, right: true });
    y -= 12;
  };
  ohead();
  for (const o of ins.orders.slice(0, 1000)) {
    if (y < M + 14) {
      page = pdf.addPage([W, H]);
      y = H - M;
      ohead();
    }
    text(o.createdAt.slice(0, 16).replace("T", " "), ocols[0], y, { size: 8 });
    text(o.reference, ocols[1], y, { size: 8 });
    text(o.customer, ocols[2], y, { size: 8 });
    text(o.fulfillment === "DELIVERY" ? "Delivery" : "Pickup", ocols[3], y, { size: 8 });
    text(String(o.items), ocols[4], y, { size: 8 });
    text(formatMoney(o.totalCents, cur), ocols[5], y, { size: 8, right: true });
    text(STATUS_META[o.status as keyof typeof STATUS_META].label, ocols[6], y, { size: 8, right: true });
    y -= 11;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(safe(`${platformName} · ${ins.restaurant.displayName} · ${ins.range.label} · page ${i + 1}/${pages.length}`), { x: M, y: 22, size: 7.5, font, color: muted }));
  return pdf.save();
}
