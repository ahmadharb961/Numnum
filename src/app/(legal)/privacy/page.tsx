import type { Metadata } from "next";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy policy" };

export default async function PrivacyPage() {
  const s = await getSettings();
  const p = s.platformName;
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
      <h1 className="text-2xl font-black text-ink">Privacy policy</h1>
      <p>This policy explains what {p} collects, why, and how it is shared. {p} is a food discovery service; we do not process payments or deliver food.</p>
      <h2>Browsing without an account</h2>
      <p>You can watch reels, browse menus and order without registering. We set a random, anonymous device identifier cookie to count video views fairly, remember likes and saved items on your device, and prevent duplicate orders. It is not used to track you on other websites.</p>
      <h2>Placing an order</h2>
      <p>
        When you place an order, you provide your name, phone number, and — for delivery — your address and optionally your map location. This information is shared <b>only with the restaurant you ordered from</b> so they can prepare, deliver and contact you about the order. It is never shown publicly or shared with other restaurants. Payment is cash on delivery; we never collect card details.
      </p>
      <p>Your cart is stored in your browser. Your delivery details are only remembered on your device if you tick “Remember my details”.</p>
      <h2>Location</h2>
      <p>We only access your device location when you tap “Use my location” at checkout, and only to create a map link for the restaurant. You can paste a Google Maps link instead.</p>
      <h2>Optional accounts</h2>
      <p>If you create an account, we store your name, email, a hashed password, your phone number, your saved delivery addresses and your order history. Orders you placed as a guest on the same device are added to your account when you sign in. Reviews show your first name only.</p>
      <h2>Restaurants</h2>
      <p>Restaurant accounts provide business details, menus, media and billing information. Payment receipts and verification documents are stored privately and visible only to the restaurant owner and {p} administrators.</p>
      <h2>Analytics</h2>
      <p>We record aggregate engagement events (views, likes, shares, product opens, add-to-cart and orders placed) to rank the feed and provide restaurant statistics. These events are not linked to your identity.</p>
      <h2>Retention</h2>
      <p>Order records are kept for commission accounting and dispute resolution, then customer contact details are deleted or anonymized according to our retention schedule. You can ask us to delete your account and associated personal data at any time.</p>
      <h2>Contact</h2>
      <p>Questions or deletion requests: {s.supportEmail}</p>
    </div>
  );
}
