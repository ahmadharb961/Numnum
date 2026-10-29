import { formatRate } from "@/lib/money";

const BILLABLE: Record<string, string> = {
  ACKNOWLEDGED: "when you acknowledge an order request in your numnum dashboard (for example by entering the order reference you received on WhatsApp)",
  ACCEPTED: "when you accept an order request in your numnum dashboard",
  FULFILLED: "when you mark an order request as fulfilled in your numnum dashboard",
  MESSAGE_CONFIRMED: "when delivery of the customer's WhatsApp message is confirmed through a verified WhatsApp Business integration",
};

export function AgreementText({ platformName, rateBps, billableEvent, dueDays, disputeDays, graceDays, version }: { platformName: string; rateBps: number; billableEvent: string; dueDays: number; disputeDays: number; graceDays: number; version: string }) {
  const rate = formatRate(rateBps);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h3]:mt-5 [&_h3]:font-bold [&_h3]:text-ink">
      <p className="text-xs text-ink-muted">Version {version}</p>
      <h3>1. What {platformName} does</h3>
      <p>{platformName} shows your dishes to customers through videos and menus and prepares their order as a WhatsApp message to your ordering number. You remain fully responsible for accepting orders, collecting payment from customers, preparing food and delivering it. {platformName} does not process customer payments or deliveries.</p>
      <h3>2. Commission rate</h3>
      <p>
        You agree to pay <b>{rate}</b> of the <b>commissionable item subtotal</b> of each qualifying order request. The commissionable subtotal is the sum of menu item prices and selected customization prices as shown on your menu at the moment the order was created. Delivery fees, tips and fees not confirmed in the order are excluded. Rounding is to the nearest cent.
      </p>
      <p className="rounded-xl bg-cream p-3 text-sm">
        Example: a $20.00 order request → {rate} commission = <b>${((2000 * rateBps) / 10000 / 100).toFixed(2)}</b>.
      </p>
      <h3>3. When commission is charged (billable event)</h3>
      <p>
        A commission entry is created exactly once per order request, <b>{BILLABLE[billableEvent] ?? BILLABLE.ACKNOWLEDGED}</b>. Customers opening WhatsApp, video views, likes and clicks are never charged. Each order has a unique reference; the same order cannot be charged twice.
      </p>
      <h3>4. Billing cycle</h3>
      <p>Commission entries accumulate during each calendar month (UTC). At the start of the following month we issue an itemized invoice listing every order reference, its date, subtotal, rate and commission. Entries acknowledged late are included in the next invoice. Issued invoices are never silently changed — corrections are made through documented adjustments or credit notes.</p>
      <h3>5. Payment terms</h3>
      <p>
        Invoices are due <b>{dueDays} days</b> after issue and are paid manually via Whish Money / Whish Pay to the recipient details shown in your dashboard, quoting the invoice number. After paying, submit the transfer reference and receipt in your dashboard. An invoice is marked paid only after {platformName} verifies that the funds were received; a screenshot alone is not proof of payment.
      </p>
      <h3>6. Disputes</h3>
      <p>You can review every order reference in your statement and dispute an entry within <b>{disputeDays} days</b> of the entry or invoice date (for example, if you never received the WhatsApp message, the order was a duplicate, or it was fraudulent). Disputed entries are excluded from invoicing until reviewed. Accepted disputes are voided or credited on your next invoice.</p>
      <h3>7. Late payment</h3>
      <p>After a grace period of {graceDays} days past the due date, {platformName} may send warnings and, following its review policy, restrict promoted content or new reels, or temporarily suspend your profile. Accounts are never restricted automatically for an invoice with a payment awaiting verification or an open dispute.</p>
      <h3>8. Honest use</h3>
      <p>You agree to acknowledge genuine order requests you receive, not to divert {platformName} customers to avoid commission, and to keep menu prices accurate. {platformName} monitors acknowledgment and rejection patterns and may review accounts with unusual activity.</p>
      <h3>9. Changes</h3>
      <p>We will notify you at least 30 days before any change to your commission rate or these terms. Changes never apply retroactively to existing commission entries.</p>
    </div>
  );
}
