import "server-only";
import { prisma } from "./db";
import { hmac } from "./crypto";
import { hashPassword, validatePassword, verifyPassword } from "./passwords";
import { sendRichEmail } from "./email";
import { emailParts } from "./restaurant-emails";
import { tFor } from "@/i18n/server";

// "Forgot password" and "Change password". The reset link is signed with the account's current
// password hash: it stops working as soon as the password changes (one use), and after an hour.

const HOUR = 3_600_000;

export function resetToken(user: { id: string; passwordHash: string }, exp = Date.now() + HOUR) {
  return `${user.id}.${exp.toString(36)}.${hmac(`reset:${user.id}:${user.passwordHash}:${exp}`).slice(0, 32)}`;
}

/** The account a reset link belongs to, if the link is still good. */
export async function checkResetToken(token: string): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" }> {
  const [userId, exp36, sig] = (token || "").split(".");
  const exp = parseInt(exp36 || "", 36);
  if (!userId || !sig || !Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, disabled: true } });
  if (!user || user.disabled || resetToken(user, exp) !== token) return { ok: false, reason: "invalid" };
  if (exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId: user.id };
}

/** Emails a reset link if the address has an account. Says nothing either way (no account probing). */
export async function sendPasswordReset(email: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true, name: true, locale: true, passwordHash: true, disabled: true } });
  if (!u || u.disabled) return;
  const t = tFor(u.locale);
  const { layout, h1, p, small, button, appUrl } = emailParts;
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(resetToken(u))}`;
  const first = u.name.split(" ")[0] || u.name;
  const html = layout(
    u.locale,
    `${h1(t("Reset your password, {name}", { name: first }))}
     ${p(t("We got a request to reset the password of your numnum account. Tap the button to choose a new one."))}
     ${button(t("Choose a new password"), link)}
     ${small(t("The link works for 1 hour and only once. If you didn't ask for this, ignore this email: your password stays the same."))}`,
  );
  const text = `${t("Reset your password, {name}", { name: first })}\n\n${t("We got a request to reset the password of your numnum account. Tap the button to choose a new one.")}\n\n${link}\n\n${t("The link works for 1 hour and only once. If you didn't ask for this, ignore this email: your password stays the same.")}`;
  await sendRichEmail(u.email, t("Reset your numnum password"), html, text);
}

/** Sets a new password from a reset link and signs the account out everywhere. */
export async function resetPassword(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await checkResetToken(token);
  if (!check.ok) return { ok: false, error: check.reason === "expired" ? "This link has expired. Ask for a new one." : "This link isn't valid anymore. Ask for a new one." };
  const bad = validatePassword(password);
  if (bad) return { ok: false, error: bad };
  await prisma.$transaction([
    prisma.user.update({ where: { id: check.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.session.deleteMany({ where: { userId: check.userId } }),
  ]);
  return { ok: true };
}

/** Changes the password of a signed-in account; other devices are signed out, this one stays in. */
export async function changePassword(userId: string, current: string, next: string, keepSessionHash: string | null): Promise<{ ok: true } | { ok: false; field?: "current" | "password"; error: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { ok: false, field: "current", error: "Your current password isn't right" };
  const bad = validatePassword(next);
  if (bad) return { ok: false, field: "password", error: bad };
  if (await verifyPassword(next, u.passwordHash)) return { ok: false, field: "password", error: "Choose a password different from your current one" };
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId, ...(keepSessionHash ? { tokenHash: { not: keepSessionHash } } : {}) } }),
  ]);
  return { ok: true };
}
