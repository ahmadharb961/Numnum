import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { restaurantsForCreator } from "@/server/creators";
import { customerLocation } from "@/server/location";
import { distanceKm } from "@/lib/geo";
import { PageHeader } from "@/components/customer/page-header";
import { CreatorRestaurants, type ShootRestaurant } from "@/components/creator/creator-restaurants";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Restaurants to shoot"), robots: { index: false } };
}

/** Every restaurant on numnum a creator can film and tag, nearest first when we know where they are. */
export default async function CreatorRestaurantsPage() {
  const me = await requireUser("/creator/restaurants");
  const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { status: true } });
  if (c?.status !== "APPROVED" && c?.status !== "SUSPENDED") redirect("/creator");
  const [rows, loc] = await Promise.all([restaurantsForCreator(me.id), customerLocation()]);
  const list: ShootRestaurant[] = rows.map(({ latitude, longitude, ...r }) => ({
    ...r,
    km: loc && latitude != null && longitude != null ? Math.round(distanceKm(loc, { lat: latitude, lng: longitude }) * 10) / 10 : null,
  }));
  if (loc) list.sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));
  const areas = [...new Set(list.map((r) => r.area).filter((a): a is string => !!a))].sort();
  return (
    <div className="pb-nav">
      <PageHeader title="Restaurants to shoot" />
      <div className="container-app max-w-2xl py-5">
        <CreatorRestaurants restaurants={list} areas={areas} canPost={c.status === "APPROVED"} />
      </div>
    </div>
  );
}
