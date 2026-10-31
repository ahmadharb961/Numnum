import type { Metadata } from "next";
import { CartView } from "@/components/customer/cart-view";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Cart"), robots: { index: false } };
}

export default function CartPage() {
  return <CartView />;
}
