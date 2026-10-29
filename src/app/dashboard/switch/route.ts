import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, RESTAURANT_COOKIE } from "@/server/auth";
import { prisma } from "@/server/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const form = await req.formData();
  const id = String(form.get("restaurantId") || "");
  if (user && (await prisma.restaurantStaff.findFirst({ where: { userId: user.id, restaurantId: id } }))) {
    (await cookies()).set(RESTAURANT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
