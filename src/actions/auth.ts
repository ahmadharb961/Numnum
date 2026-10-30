"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession, destroySession, hashPassword, validatePassword, verifyPassword, RESTAURANT_COOKIE } from "@/server/auth";
import { mergeDeviceIntoUser } from "@/server/engagement";
import { claimDeviceOrders } from "@/server/orders";
import { deviceId } from "@/server/request";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/request";
import { normalizePhone } from "@/lib/phone";
import { uniqueSlug } from "@/server/restaurants";
import { notifyAdmins } from "@/server/notifications";
import { audit } from "@/server/audit";
import { cookies } from "next/headers";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; message?: string } | undefined;

function safeNext(next: unknown, fallback: string) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000).ok || !rateLimit(`login:${email}`, 8, 15 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const user = await prisma.user.findUnique({ where: { email }, include: { roles: true, staff: true } });
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) return { error: "Incorrect email or password" };
  await createSession(user.id, (await headers()).get("user-agent"));
  await mergeDeviceIntoUser(user.id);
  await claimDeviceOrders(user.id, await deviceId());
  const roles = user.roles.map((r) => r.role);
  const fallback = roles.includes("ADMIN") ? "/admin" : user.staff.length ? "/dashboard" : "/";
  redirect(safeNext(form.get("next"), fallback));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string(),
  phone: z.string().trim().optional(),
});

export async function registerCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many sign-ups from this network. Try later." };
  const parsed = customerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) };
  const { name, email, password } = parsed.data;
  const pwErr = validatePassword(password);
  if (pwErr) return { fieldErrors: { password: pwErr } };
  let phone: string | null = null;
  if (parsed.data.phone) {
    const p = normalizePhone(parsed.data.phone);
    if (!p.ok) return { fieldErrors: { phone: p.error } };
    phone = p.e164;
  }
  if (await prisma.user.findUnique({ where: { email } })) return { fieldErrors: { email: "An account with this email already exists" } };
  const user = await prisma.user.create({ data: { email, name, phone, passwordHash: await hashPassword(password), roles: { create: { role: "CUSTOMER" } } } });
  await createSession(user.id, (await headers()).get("user-agent"));
  await mergeDeviceIntoUser(user.id);
  await claimDeviceOrders(user.id, await deviceId());
  redirect(safeNext(form.get("next"), "/account"));
}

const restaurantSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string(),
  businessName: z.string().trim().min(2, "Enter the business name").max(120),
  displayName: z.string().trim().min(2, "Enter the restaurant name").max(80),
  phone: z.string().trim().min(6, "Enter a phone number"),
  cuisine: z.string().trim().max(60).optional(),
  area: z.string().trim().max(80).optional(),
});

export async function registerRestaurantAction(_: FormState, form: FormData): Promise<FormState> {
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many sign-ups from this network. Try later." };
  const parsed = restaurantSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) };
  const d = parsed.data;
  const pwErr = validatePassword(d.password);
  if (pwErr) return { fieldErrors: { password: pwErr } };
  const phone = normalizePhone(d.phone);
  if (!phone.ok) return { fieldErrors: { phone: phone.error } };
  if (form.get("terms") !== "on") return { fieldErrors: { terms: "Please accept the terms of service" } };

  const existing = await prisma.user.findUnique({ where: { email: d.email }, include: { roles: true } });
  const session = await (await import("@/server/auth")).getCurrentUser();
  if (existing && session?.id !== existing.id) return { fieldErrors: { email: "This email is already registered. Log in to add a restaurant." } };
  if (existing && !(await verifyPassword(d.password, existing.passwordHash))) return { fieldErrors: { password: "Incorrect password" } };

  const slug = await uniqueSlug(d.displayName);
  const result = await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({ data: { email: d.email, name: d.ownerName, phone: phone.e164, passwordHash: await hashPassword(d.password) } }));
    if (!existing?.roles.some((r) => r.role === "RESTAURANT")) await tx.userRole.create({ data: { userId: user.id, role: "RESTAURANT" } });
    const restaurant = await tx.restaurant.create({
      data: {
        slug,
        businessName: d.businessName,
        displayName: d.displayName,
        phone: phone.e164,
        email: d.email,
        cuisine: d.cuisine || null,
        area: d.area || null,
        city: d.area ? null : "Beirut",
        staff: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    return { user, restaurant };
  });
  await audit({ actorId: result.user.id, action: "restaurant.register", entityType: "restaurant", entityId: result.restaurant.id });
  await notifyAdmins({ type: "NEW_RESTAURANT", title: `New restaurant registered: ${d.displayName}`, link: `/admin/restaurants/${result.restaurant.id}` });
  if (!session) await createSession(result.user.id, (await headers()).get("user-agent"));
  (await cookies()).set(RESTAURANT_COOKIE, result.restaurant.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/dashboard?welcome=1");
}

export async function updateCustomerProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await (await import("@/server/auth")).requireUser("/account");
  const name = String(form.get("name") || "").trim();
  const phoneRaw = String(form.get("phone") || "").trim();
  if (name.length < 2) return { fieldErrors: { name: "Enter your name" } };
  let phone: string | null = null;
  if (phoneRaw) {
    const p = normalizePhone(phoneRaw);
    if (!p.ok) return { fieldErrors: { phone: p.error } };
    phone = p.e164;
  }
  await prisma.user.update({ where: { id: user.id }, data: { name, phone } });
  return { ok: true, message: "Profile updated" };
}
