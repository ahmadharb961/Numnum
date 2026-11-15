"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser, SESSION_COOKIE } from "@/server/auth";
import { hmac } from "@/server/crypto";
import { changePassword, resetPassword, sendPasswordReset } from "@/server/password-reset";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/request";
import { audit } from "@/server/audit";
import type { FormState } from "./auth";

/** "Forgot password": always the same answer, so it never reveals whether an email has an account. */
export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { fieldErrors: { email: "Enter a valid email" } };
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  // A few emails per address per hour at most, so nobody can flood someone's inbox.
  if (rateLimit(`forgot:${email}`, 3, 60 * 60_000).ok) await sendPasswordReset(email);
  return { ok: true, message: "If there's a numnum account with this email, we've sent it a link to choose a new password. Check your inbox (and spam)." };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm") || "");
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match" } };
  const r = await resetPassword(token, password);
  if (!r.ok) return { error: r.error };
  redirect("/login?reset=1");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/account/password");
  const current = String(form.get("current") || "");
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm") || "");
  if (!rateLimit(`change-pw:${user.id}`, 6, 15 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match" } };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await changePassword(user.id, current, password, token ? hmac(token) : null);
  if (!r.ok) return r.field ? { fieldErrors: { [r.field]: r.error } } : { error: r.error };
  await audit({ actorId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id });
  return { ok: true, message: "Password changed. Other devices were logged out." };
}
