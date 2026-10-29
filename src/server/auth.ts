import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, StaffRole } from "@prisma/client";
import { prisma } from "./db";
import { hmac, randomToken } from "./crypto";
import { ipHash } from "./request";

export const SESSION_COOKIE = "nn_session";
export const RESTAURANT_COOKIE = "nn_rest";
const SESSION_DAYS = 30;

export { hashPassword, verifyPassword, validatePassword } from "./passwords";

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: { tokenHash: hmac(token), userId, expiresAt, ipHash: await ipHash(), userAgent: userAgent?.slice(0, 200) },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hmac(token) } });
  jar.delete(SESSION_COOKIE);
  jar.delete(RESTAURANT_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  roles: Role[];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hmac(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabled) return null;
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, phone: u.phone, roles: u.roles.map((r) => r.role) };
});

export function hasRole(user: CurrentUser | null, role: Role) {
  return !!user?.roles.includes(role);
}

export async function requireUser(next = "/login"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login?next=/admin");
  if (!hasRole(u, "ADMIN")) redirect("/");
  return u;
}

const STAFF_RANK: Record<StaffRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };

export type RestaurantContext = {
  user: CurrentUser;
  restaurant: Awaited<ReturnType<typeof loadRestaurant>>;
  staffRole: StaffRole;
  memberships: { id: string; displayName: string }[];
};

async function loadRestaurant(id: string) {
  const r = await prisma.restaurant.findUnique({ where: { id } });
  if (!r) throw new Error("Restaurant not found");
  return r;
}

/** Resolves the active restaurant for the current staff user. Enforces tenant isolation. */
export const getRestaurantContext = cache(async (): Promise<RestaurantContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await prisma.restaurantStaff.findMany({
    where: { userId: user.id },
    include: { restaurant: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) return null;
  const jar = await cookies();
  const chosen = jar.get(RESTAURANT_COOKIE)?.value;
  const m = memberships.find((x) => x.restaurantId === chosen) ?? memberships[0];
  return {
    user,
    restaurant: await loadRestaurant(m.restaurantId),
    staffRole: m.role,
    memberships: memberships.map((x) => ({ id: x.restaurant.id, displayName: x.restaurant.displayName })),
  };
});

export async function requireRestaurant(minRole: StaffRole = "STAFF"): Promise<RestaurantContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const ctx = await getRestaurantContext();
  if (!ctx) redirect("/business/register");
  if (STAFF_RANK[ctx.staffRole] < STAFF_RANK[minRole]) throw new PermissionError(`Requires ${minRole.toLowerCase()} access`);
  return ctx;
}

export function canAccess(role: StaffRole, minRole: StaffRole) {
  return STAFF_RANK[role] >= STAFF_RANK[minRole];
}

export class PermissionError extends Error {
  status = 403;
}

export class UserError extends Error {
  status = 400;
}
