import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { prisma } from "@/server/db";
import { ownerKey } from "@/server/engagement";
import { getCurrentUser } from "@/server/auth";
import { getMainImages } from "@/server/menu";
import { publicReelWhere } from "@/server/feed";
import { DishCard, ReelThumb, RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const [key, user] = await Promise.all([ownerKey(), getCurrentUser()]);
  const saved = key ? await prisma.savedItem.findMany({ where: { ownerKey: key }, orderBy: { createdAt: "desc" } }) : [];
  const ids = (t: string) => saved.filter((s) => s.type === t).map((s) => s.refId);
  const [reels, items, restaurants] = await Promise.all([
    prisma.reel.findMany({ where: { ...publicReelWhere, id: { in: ids("REEL") } }, select: { id: true, posterUrl: true, viewCount: true } }),
    prisma.menuItem.findMany({ where: { id: { in: ids("ITEM") }, archived: false }, include: { restaurant: { select: { slug: true, displayName: true, verificationStatus: true } } } }),
    prisma.restaurant.findMany({ where: { id: { in: ids("RESTAURANT") }, status: "ACTIVE" }, include: { _count: { select: { menuItems: true } } } }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));
  const empty = !reels.length && !items.length && !restaurants.length;
  return (
    <main className="pb-nav">
      <header className="container-app pb-2" style={{ paddingTop: "calc(var(--safe-top) + 14px)" }}>
        <h1 className="text-2xl font-black tracking-tight">Saved</h1>
        {!user && (
          <p className="mt-1 text-sm text-ink-muted">
            Saved on this device.{" "}
            <Link href="/account/register?next=/saved" className="font-semibold text-brand-600">
              Create an account
            </Link>{" "}
            to keep them across devices.
          </p>
        )}
        {user && (
          <p className="mt-1 text-sm text-ink-muted">
            Signed in as {user.name} ·{" "}
            <Link href="/account" className="font-semibold text-brand-600">
              Account
            </Link>
          </p>
        )}
      </header>
      <div className="container-app space-y-6 pt-2">
        {empty && <EmptyState icon={<Bookmark />} title="Nothing saved yet" body="Tap the bookmark on reels or save restaurants to find them here." action={<Link href="/" className="chip chip-active">Watch reels</Link>} />}
        {reels.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">Reels</h2>
            <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
              {reels.map((r) => (
                <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} />
              ))}
            </div>
          </section>
        )}
        {items.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">Dishes</h2>
            <div className="grid gap-2.5">
              {items.map((i) => (
                <DishCard key={i.id} item={{ ...i, image: images.get(i.id) ?? null }} />
              ))}
            </div>
          </section>
        )}
        {restaurants.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">Restaurants</h2>
            <div className="grid gap-3">
              {restaurants.map((r) => (
                <RestaurantCard key={r.id} r={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
