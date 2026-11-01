import { seeOther } from "@/server/http";
import { cookies } from "next/headers";
import { ADMIN_AS_COOKIE } from "@/server/auth";

/** Leaves "Manage as admin" and goes back to that restaurant in the admin panel. */
export async function POST() {
  const jar = await cookies();
  const id = jar.get(ADMIN_AS_COOKIE)?.value;
  jar.delete(ADMIN_AS_COOKIE);
  return seeOther(id ? `/admin/restaurants/${id}` : "/admin/restaurants");
}
