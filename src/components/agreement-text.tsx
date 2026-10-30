import { formatRate } from "@/lib/money";

const BILLABLE: Record<string, string> = {
  ACCEPTED: "when you accept the order in your numnum dashboard",
  COMPLETED: "when the order is completed — marked delivered or picked up by you, or completed automatically (see section 4)",
};

export function AgreementText({ platformName, rateBps, billableEvent, dueDays, disputeDays, graceDays, version, autoCompleteHours }: { platformName: string; rateBps: number; billableEvent: string; dueDays: number; disputeDays: number; graceDays: number; version: string; autoCompleteHours: number }) {
  const rate = formatRate(rateBps);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h3]:mt-5 [&_h3]:font-bold [&_h3]:text-ink">
      <p className="text-xs text-ink-muted">Version {version}</p>
      <h3>1. What {platformName} does</h3>
      <p>{platformName} shows your dishes to customers through videos and menus and sends you their orders in your dashboard. Customers pay <b>cash on delivery</b> (or cash at pickup) directly to you. You are responsible for accepting orders, preparing food, delivering it and collecting the cash. {platformName} does not process customer payments or deliver food.</p>
      <h3>2. Commission rate</h3>
      <p>
        You agree to pay <b>{rate}</b> of the <b>item subtotal</b> of each commissionable order: menu item prices plus selected customization prices, as shown on your menu when the order was placed. Delivery fees and tips are excluded. Rounding is to the nearest cent.
      </p>
      <p className="rounded-xl bg-cream p-3 text-sm">
        Example: an order with a $20.00 item subtotal → {rate} commission = <b>${((2000 * rateBps) / 10000 / 100).toFixed(2)}</b>.
      </p>
      <h3>3. When commission is charged</h3>
      <p>
        A commission entry is created exactly once per order, <b>{BILLABLE[billableEvent] ?? BILLABLE.COMPLETED}</b>. Orders you reject, and orders the customer cancels before you accept them, are never charged. Video views, likes and clicks are never charged.
      </p>
      <h3>4. Closing orders</h3>
      <p>Please mark each order as delivered or picked up when you hand it over. An accepted order that is still open {autoCompleteHours} hours after you accepted it is completed automatically. If an order couldn&apos;t be delivered (customer unreachable, refused or wrong address), report it from the order before then, or dispute the entry later (section 7).</p>
      <h3>5. Billing cycle</h3>
      <p>Commission entries accumulate during each calendar month (UTC). At the start of the following month we issue an itemized invoice listing every order reference, its date, item subtotal, rate and commission. Issued invoices are never silently changed — corrections are made through documented adjustments or credit notes.</p>
      <h3>6. Payment terms</h3>
      <p>
        Invoices are due <b>{dueDays} days</b> after issue and are paid manually via Whish Money / Whish Pay to the recipient details shown in your dashboard, quoting the invoice number. After paying, submit the transfer reference and receipt in your dashboard. An invoice is marked paid only after {platformName} verifies that the funds were received.
      </p>
      <h3>7. Disputes</h3>
      <p>You can review every order reference in your statement and dispute an entry within <b>{disputeDays} days</b> of the entry or invoice date (for example: the order wasn&apos;t delivered, the customer refused to pay, or it was a duplicate or fake order). Disputed entries are excluded from invoicing until reviewed. Accepted disputes are voided or credited on your next invoice.</p>
      <h3>8. Late payment</h3>
      <p>After a grace period of {graceDays} days past the due date, {platformName} may send warnings and, following its review policy, restrict promoted content or new reels, or temporarily suspend your profile. Accounts are never restricted automatically for an invoice with a payment awaiting verification or an open dispute.</p>
      <h3>9. Honest use</h3>
      <p>You agree to process genuine orders through {platformName}, not to move {platformName} customers to other channels to avoid commission, to keep menu prices and delivery fees accurate, and to use customer contact details only to fulfill their orders. {platformName} monitors rejection and failed-delivery patterns and may review accounts with unusual activity.</p>
      <h3>10. Changes</h3>
      <p>We will notify you at least 30 days before any change to your commission rate or these terms. Changes never apply retroactively to existing commission entries.</p>
    </div>
  );
}
