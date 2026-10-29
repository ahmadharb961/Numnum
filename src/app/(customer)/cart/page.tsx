import type { Metadata } from "next";
import { CartView } from "@/components/customer/cart-view";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default function CartPage() {
  return <CartView />;
}
