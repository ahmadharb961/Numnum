import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_AS_COOKIE, getCurrentUser, hasRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";

/** "Manage as admin": opens this restaurant's dashboard (menu, photos, reels, settings) for an admin. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !hasRole(user, "ADMIN")) return NextResponse.redirect(new URL("/login?next=/admin", req.url), 303);
  const r = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
  if (!r) return NextResponse.redirect(new URL("/admin/restaurants", req.url), 303);
  (await cookies()).set(ADMIN_AS_COOKIE, r.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  await audit({ actorId: user.id, action: "restaurant.admin_manage", entityType: "restaurant", entityId: r.id });
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
