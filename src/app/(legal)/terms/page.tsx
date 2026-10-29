import type { Metadata } from "next";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of service" };

export default async function TermsPage() {
  const s = await getSettings();
  const p = s.platformName;
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
      <h1 className="text-2xl font-black text-ink">Terms of service</h1>
      <h2>The service</h2>
      <p>{p} helps you discover food from independent restaurants and prepares your order as a WhatsApp message. The restaurant — not {p} — confirms availability, sets the final price and delivery fee, accepts payment and delivers your food. Orders are only placed once you send the WhatsApp message and the restaurant confirms it.</p>
      <h2>Prices & information</h2>
      <p>Menus, prices, ingredients and allergen information are provided by restaurants. We do not infer ingredients or allergens from images. If you have an allergy, confirm with the restaurant before ordering. Delivery fees shown as “to be confirmed” are set by the restaurant.</p>
      <h2>Reviews & content</h2>
      <p>Reviews must reflect genuine experiences. We may hide or remove content that is fake, abusive, misleading or infringing, under our moderation rules. The verified badge confirms a restaurant&apos;s business identity, not food quality. Sponsored content is labeled.</p>
      <h2>Restaurants</h2>
      <p>Restaurants agree to the commission agreement, to keep menu information accurate, and to handle customer data only to fulfill orders.</p>
      <h2>Liability</h2>
      <p>{p} is not a party to the sale between you and the restaurant and is not responsible for food quality, preparation, delivery or payment disputes, which should be resolved with the restaurant. Contact {s.supportEmail} to report a problem.</p>
    </div>
  );
}
