import type { Metadata } from "next";
import { Checkout } from "@/components/customer/checkout";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return <Checkout mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""} />;
}
