import "server-only";
import { prisma } from "./db";
import { hmac } from "./crypto";
import { sendRichEmail } from "./email";
import { getSettings } from "./settings";
import { tFor } from "@/i18n/server";
import { formatPhone } from "@/lib/phone";

// Restaurant sign-up emails: "confirm your email", then the welcome email once confirmed.

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const DAY = 86_400_000;

// ───── Email confirmation link (signed, valid 7 days) ─────

export function verifyToken(userId: string, email: string, exp = Date.now() + 7 * DAY) {
  return `${userId}.${exp.toString(36)}.${hmac(`verify:${userId}:${email.toLowerCase()}:${exp}`).slice(0, 32)}`;
}

export async function confirmEmail(token: string): Promise<{ ok: true; userId: string; already: boolean } | { ok: false; reason: "invalid" | "expired" }> {
  const [userId, exp36, sig] = (token || "").split(".");
  const exp = parseInt(exp36 || "", 36);
  if (!userId || !sig || !Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user || verifyToken(user.id, user.email, exp) !== token) return { ok: false, reason: "invalid" };
  if (user.emailVerifiedAt) return { ok: true, userId: user.id, already: true };
  if (exp < Date.now()) return { ok: false, reason: "expired" };
  // Only the first confirmation sends the welcome email.
  const { count } = await prisma.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  if (count) {
    const owned = await prisma.restaurantStaff.findMany({ where: { userId: user.id, role: "OWNER" }, select: { restaurantId: true } });
    for (const o of owned) await sendRestaurantWelcome(o.restaurantId);
  }
  return { ok: true, userId: user.id, already: !count };
}

export async function sendVerifyEmail(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, locale: true, emailVerifiedAt: true } });
  if (!u || u.emailVerifiedAt) return false;
  const t = tFor(u.locale);
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(verifyToken(u.id, u.email))}`;
  const first = u.name.split(" ")[0];
  const html = layout(
    u.locale,
    `${h1(t("Confirm your email, {name}", { name: first }))}
     ${p(t("One tap and your numnum restaurant account is ready. We'll then send you everything you need to start."))}
     ${button(t("Confirm my email"), link)}
     ${small(t("The link works for 7 days. If you didn't sign up on numnum, ignore this email."))}`,
  );
  const text = `${t("Confirm your email, {name}", { name: first })}\n\n${t("One tap and your numnum restaurant account is ready. We'll then send you everything you need to start.")}\n\n${link}`;
  return sendRichEmail(u.email, t("Confirm your email to start on numnum"), html, text);
}

// ───── Welcome email ─────

export type WelcomeData = {
  ownerName: string;
  restaurantName: string;
  ratePct: string; // "14%"
  dueDays: number;
  graceDays: number;
  whishName: string;
  whishNumber: string;
  loginEmail: string;
};

/** Builds the welcome email (pure: used for sending, tests and previews). */
export function welcomeEmail(d: WelcomeData, locale: string | null | undefined) {
  const t = tFor(locale);
  const app = appUrl();
  const first = d.ownerName.split(" ")[0];
  const whish = d.whishNumber
    ? t("Send it with Whish to {name} · {number}, with the invoice number in the note.", { name: esc(d.whishName || "numnum"), number: ltr(esc(formatPhone(d.whishNumber.replace(/\D/g, "")) || d.whishNumber)) })
    : t("Send it with Whish: the details are on every invoice in your dashboard.");
  const steps = [
    ["🍔", t("Add your menu and photos"), t("Import it in minutes from a spreadsheet.")],
    ["📍", t("Pin your location and delivery zones"), t("Customers outside your zones can still pick up.")],
    ["🎬", t("Upload your first reel"), t("Short food videos are how customers find you.")],
  ];
  const html = layout(
    locale,
    `<img src="${app}/og.png" width="512" alt="numnum" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:14px;margin:0 0 20px">
     ${h1(t("Welcome to numnum, {name}! 🎉", { name: first }))}
     ${p(t("{restaurant} is on numnum. Here's everything in one minute.", { restaurant: `<b>${esc(d.restaurantName)}</b>` }), true)}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#fff4ee;border-radius:14px">
       <tr>
         <td width="96" align="center" style="padding:16px 0 16px 16px"><div style="width:80px;height:80px;border-radius:40px;background:#ff5412;color:#fff;font:900 24px/80px Arial,sans-serif;text-align:center">${esc(d.ratePct)}</div></td>
         <td style="padding:16px">
           <div style="font:800 17px Arial,sans-serif;color:#16120f">${t("Your commission")}</div>
           <div style="font:15px/1.5 Arial,sans-serif;color:#4a423d">${t("{rate} of the food total, only on completed orders. No monthly fee, no setup fee.", { rate: esc(d.ratePct) })}</div>
         </td>
       </tr>
     </table>

     ${h2(t("Go live in 3 steps"))}
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${steps
         .map(
           ([icon, title, sub], i) => `<tr>
         <td width="44" valign="top" style="padding:8px 0"><div style="width:36px;height:36px;border-radius:18px;background:#16120f;color:#fff;font:800 15px/36px Arial,sans-serif;text-align:center">${i + 1}</div></td>
         <td style="padding:8px 0 8px 10px"><div style="font:700 15px Arial,sans-serif;color:#16120f">${icon} ${title}</div><div style="font:14px/1.4 Arial,sans-serif;color:#7a706b">${sub}</div></td>
       </tr>`,
         )
         .join("")}
     </table>
     ${button(t("Open my dashboard"), `${app}/dashboard`)}
     ${small(t("Log in at {url} with {email}.", { url: ltr(`${app.replace(/^https?:\/\//, "")}/login`), email: ltr(esc(d.loginEmail)) }))}

     ${callout("📲", t("Add numnum to your phone and turn on notifications"), t("Open your dashboard on your phone, add it to the home screen and allow notifications, so a new order rings even when the screen is locked."), "#eef6ff")}

     ${callout("💵", t("Paying your commission"), `${t("On the 1st of each month you get an invoice for last month's completed orders. Pay it within {days} days.", { days: d.dueDays })} ${whish}<br><b style="color:#c2410c">${t("Please don't be late: after {days} more days, promotion stops and your profile can be paused.", { days: d.graceDays })}</b>`, "#fff7e6")}

     ${h2(t("Why restaurants love numnum"))}
     ${bullet("🎬", t("Customers discover your food through short videos, then order in one tap."))}
     ${bullet("💵", t("Cash on delivery: you deliver and collect, nothing to set up."))}
     ${bullet("📈", t("Insights show your views, orders and revenue, so you know what sells."))}
     <div style="height:8px"></div>
     ${small(t("Questions? Just reply to this email."))}`,
    { logo: false },
  );
  const text = [
    t("Welcome to numnum, {name}! 🎉", { name: first }),
    "",
    `${t("Your commission")}: ${t("{rate} of the food total, only on completed orders. No monthly fee, no setup fee.", { rate: d.ratePct })}`,
    "",
    t("Go live in 3 steps"),
    ...steps.map(([, title], i) => `${i + 1}. ${title}`),
    `${t("Open my dashboard")}: ${app}/dashboard`,
    "",
    `${t("Add numnum to your phone and turn on notifications")}: ${t("Open your dashboard on your phone, add it to the home screen and allow notifications, so a new order rings even when the screen is locked.")}`,
    "",
    `${t("Paying your commission")}: ${t("On the 1st of each month you get an invoice for last month's completed orders. Pay it within {days} days.", { days: d.dueDays })} ${whish.replace(/<[^>]+>/g, "")}`,
    t("Please don't be late: after {days} more days, promotion stops and your profile can be paused.", { days: d.graceDays }),
    "",
    t("Insights show your views, orders and revenue, so you know what sells."),
  ].join("\n");
  return { subject: t("Welcome to numnum, {restaurant} 🎉", { restaurant: d.restaurantName }), html, text };
}

export async function sendRestaurantWelcome(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { displayName: true, commissionRateBps: true, staff: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, name: true, locale: true } } } } },
  });
  const owner = r?.staff[0]?.user;
  if (!r || !owner) return false;
  const s = await getSettings();
  const bps = r.commissionRateBps ?? s.defaultCommissionRateBps;
  const mail = welcomeEmail(
    { ownerName: owner.name, restaurantName: r.displayName, ratePct: `${Number((bps / 100).toFixed(2))}%`, dueDays: s.invoiceDueDays, graceDays: s.graceDays, whishName: s.whish.recipientName, whishNumber: s.whish.whishNumber, loginEmail: owner.email },
    owner.locale,
  );
  return sendRichEmail(owner.email, mail.subject, mail.html, mail.text);
}

// ───── HTML building blocks (inline styles: email clients ignore stylesheets) ─────

/** Numbers, links and emails stay left-to-right inside Arabic sentences. */
const ltr = (s: string) => `<span dir="ltr" style="unicode-bidi:isolate;white-space:nowrap">${s}</span>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const h1 = (s: string) => `<h1 style="margin:0 0 8px;font:900 24px/1.25 Arial,sans-serif;color:#16120f">${esc(s)}</h1>`;
const h2 = (s: string) => `<h2 style="margin:22px 0 6px;font:800 18px Arial,sans-serif;color:#16120f">${esc(s)}</h2>`;
const p = (s: string, raw = false) => `<p style="margin:0 0 10px;font:16px/1.55 Arial,sans-serif;color:#4a423d">${raw ? s : esc(s)}</p>`;
const small = (s: string) => `<p style="margin:10px 0 0;font:13px/1.5 Arial,sans-serif;color:#7a706b">${s}</p>`;
const button = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td style="border-radius:12px;background:#ff5412"><a href="${href}" style="display:inline-block;padding:14px 26px;font:800 16px Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)}</a></td></tr></table>`;
const callout = (icon: string, title: string, body: string, bg: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:${bg};border-radius:14px"><tr><td width="44" valign="top" style="padding:16px 0 16px 16px;font-size:26px">${icon}</td><td style="padding:16px"><div style="font:800 16px Arial,sans-serif;color:#16120f">${esc(title)}</div><div style="margin-top:4px;font:14px/1.55 Arial,sans-serif;color:#4a423d">${body}</div></td></tr></table>`;
const bullet = (icon: string, s: string) => `<p style="margin:6px 0;font:15px/1.5 Arial,sans-serif;color:#4a423d"><span style="font-size:18px">${icon}</span>&nbsp; ${esc(s)}</p>`;

function layout(locale: string | null | undefined, inner: string, { logo = true } = {}) {
  const app = appUrl();
  const rtl = locale === "ar";
  const font = rtl ? "Tahoma,Arial,sans-serif" : "Arial,sans-serif";
  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#fdf8f2;padding:24px 12px;font-family:${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px" dir="${rtl ? "rtl" : "ltr"}">
${logo ? `<tr><td style="padding:0 4px 16px"><a href="${app}"><img src="${app}/logo/numnum-email.png" width="96" height="58" alt="numnum" style="display:block;border:0;width:96px;height:auto"></a></td></tr>` : ""}
<tr><td style="background:#ffffff;border-radius:18px;padding:24px;text-align:${rtl ? "right" : "left"}">${inner}</td></tr>
<tr><td dir="ltr" style="padding:16px 4px;font:12px Arial,sans-serif;color:#7a706b;text-align:${rtl ? "right" : "left"}">numnum · Watch it. Crave it. Order it.</td></tr>
</table></td></tr></table></body></html>`;
}

