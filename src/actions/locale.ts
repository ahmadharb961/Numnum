"use server";

import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { isLocale, LOCALE_COOKIE } from "@/i18n/core";

/** Switches the app language for this device, and for the account (emails, notifications, other devices). */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return { ok: false as const };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { locale } });
  return { ok: true as const };
}
