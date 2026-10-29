import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicItem } from "@/server/items";
import { ItemDetail } from "@/components/customer/item-detail";
import { PageHeader } from "@/components/customer/page-header";
import { formatMoney } from "@/lib/money";
import { ItemViewTracker } from "@/components/customer/item-view-tracker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const item = await getPublicItem((await params).id);
  if (!item) return { title: "Dish not found" };
  const title = `${item.name} · ${item.restaurant.name}`;
  const description = `${formatMoney(item.priceCents, item.currency)} — ${item.description ?? `Order ${item.name} from ${item.restaurant.name} on WhatsApp.`}`.slice(0, 200);
  return { title, description, alternates: { canonical: `/item/${item.id}` }, openGraph: { title, description, images: item.images[0] ? [{ url: item.images[0].url }] : undefined } };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const item = await getPublicItem((await params).id);
  if (!item) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: item.name,
    description: item.description ?? undefined,
    image: item.images.map((i) => i.url),
    offers: { "@type": "Offer", price: (item.priceCents / (item.currency === "LBP" ? 1 : 100)).toFixed(item.currency === "LBP" ? 0 : 2), priceCurrency: item.currency, availability: item.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    aggregateRating: item.ratingCount ? { "@type": "AggregateRating", ratingValue: item.ratingAvg.toFixed(1), reviewCount: item.ratingCount } : undefined,
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHeader title={item.name} sub={item.restaurant.name} />
      <div className="mx-auto max-w-screen-sm bg-cream">
        <ItemDetail item={item} navOffset />
      </div>
      <ItemViewTracker itemId={item.id} />
    </main>
  );
}
