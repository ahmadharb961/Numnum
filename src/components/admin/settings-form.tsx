"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettingsAction } from "@/actions/admin";
import type { Settings } from "@/server/settings";
import { Section } from "@/components/dashboard/page";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const save = (keys: (keyof Settings)[]) =>
    start(async () => {
      const r = await saveSettingsAction(Object.fromEntries(keys.map((k) => [k, s[k]])) as Partial<Settings>);
      toast(r.ok ? r.message ?? "Saved" : r.error, r.ok ? "success" : "error");
      router.refresh();
    });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div>
      <Section title="Branding & platform">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Platform name">
            <input className="input" value={s.platformName} onChange={(e) => setS({ ...s, platformName: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <input className="input" value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} />
          </Field>
          <Field label="Support email">
            <input className="input" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={s.requireRestaurantApproval} onChange={(e) => setS({ ...s, requireRestaurantApproval: e.target.checked })} className="h-5 w-5 accent-brand-500" /> New restaurants require admin approval before going live
        </label>
        <Button className="mt-4" loading={pending} onClick={() => save(["platformName", "tagline", "supportEmail", "requireRestaurantApproval"])}>
          Save
        </Button>
      </Section>

      <Section title="Commission">
        <Alert tone="blue" className="mb-4">
          Clicking WhatsApp is never proof that a message was sent. Restaurant acknowledgment is the recommended billable event unless a verified WhatsApp Business integration provides delivery evidence.
        </Alert>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default commission rate (%)">
            <input className="input" inputMode="decimal" value={s.defaultCommissionRateBps / 100} onChange={(e) => setS({ ...s, defaultCommissionRateBps: Math.round(num(e.target.value) * 100) })} />
          </Field>
          <Field label="Billable event">
            <select className="input" value={s.billableEvent} onChange={(e) => setS({ ...s, billableEvent: e.target.value as Settings["billableEvent"] })}>
              <option value="ACKNOWLEDGED">Restaurant acknowledges request</option>
              <option value="ACCEPTED">Restaurant accepts order</option>
              <option value="FULFILLED">Restaurant marks fulfilled</option>
              <option value="MESSAGE_CONFIRMED" disabled={!s.whatsappBusinessIntegration}>
                WhatsApp message delivery confirmed (requires integration)
              </option>
            </select>
          </Field>
          <Field label="Agreement version">
            <input className="input" value={s.agreementVersion} onChange={(e) => setS({ ...s, agreementVersion: e.target.value })} />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={s.whatsappBusinessIntegration} onChange={(e) => setS({ ...s, whatsappBusinessIntegration: e.target.checked })} className="h-5 w-5 accent-brand-500" /> A verified WhatsApp Business messaging integration is live and records delivery evidence
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Suspicious rejection threshold (%)" hint="Flags restaurants that rarely acknowledge requests">
            <input className="input" value={Math.round(s.suspiciousRejectRate * 100)} onChange={(e) => setS({ ...s, suspiciousRejectRate: num(e.target.value) / 100 })} />
          </Field>
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(["defaultCommissionRateBps", "billableEvent", "agreementVersion", "whatsappBusinessIntegration", "suspiciousRejectRate"])}>
          Save commission settings
        </Button>
      </Section>

      <Section title="Whish Money / Whish Pay recipient" description="Shown to restaurants when they pay invoices. Never hardcoded.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Recipient name">
            <input className="input" value={s.whish.recipientName} onChange={(e) => setS({ ...s, whish: { ...s.whish, recipientName: e.target.value } })} />
          </Field>
          <Field label="Whish number">
            <input className="input" value={s.whish.whishNumber} onChange={(e) => setS({ ...s, whish: { ...s.whish, whishNumber: e.target.value } })} />
          </Field>
          <Field label="Account ID (optional)">
            <input className="input" value={s.whish.accountId} onChange={(e) => setS({ ...s, whish: { ...s.whish, accountId: e.target.value } })} />
          </Field>
        </div>
        <Field label="Payment instructions">
          <textarea className="input" value={s.whish.instructions} onChange={(e) => setS({ ...s, whish: { ...s.whish, instructions: e.target.value } })} />
        </Field>
        <Button className="mt-4" loading={pending} onClick={() => save(["whish"])}>
          Save payment details
        </Button>
      </Section>

      <Section title="Invoicing, reminders & overdue policy">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Invoice due (days after issue)">
            <input className="input" type="number" value={s.invoiceDueDays} onChange={(e) => setS({ ...s, invoiceDueDays: num(e.target.value) })} />
          </Field>
          <Field label="Grace period (days)">
            <input className="input" type="number" value={s.graceDays} onChange={(e) => setS({ ...s, graceDays: num(e.target.value) })} />
          </Field>
          <Field label="Dispute window (days)">
            <input className="input" type="number" value={s.disputeWindowDays} onChange={(e) => setS({ ...s, disputeWindowDays: num(e.target.value) })} />
          </Field>
          <Field label="Reminder before due (days)">
            <input className="input" type="number" value={s.reminders.daysBeforeDue} onChange={(e) => setS({ ...s, reminders: { ...s.reminders, daysBeforeDue: num(e.target.value) } })} />
          </Field>
          <Field label="Reminders after due (days, comma separated)">
            <input className="input" value={s.reminders.daysAfterDue.join(", ")} onChange={(e) => setS({ ...s, reminders: { ...s.reminders, daysAfterDue: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) } })} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.reminders.onIssue} onChange={(e) => setS({ ...s, reminders: { ...s.reminders, onIssue: e.target.checked } })} className="accent-brand-500" /> Notify on issue
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.reminders.onDue} onChange={(e) => setS({ ...s, reminders: { ...s.reminders, onDue: e.target.checked } })} className="accent-brand-500" /> Remind on due date
          </label>
        </div>
        <div className="mt-4 rounded-xl bg-cream p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={s.overduePolicy.autoApply} onChange={(e) => setS({ ...s, overduePolicy: { ...s.overduePolicy, autoApply: e.target.checked } })} className="h-5 w-5 accent-brand-500" /> Automatically apply restrictions to overdue accounts
          </label>
          <p className="mt-1 text-xs text-ink-muted">Never applied to invoices with a payment awaiting verification or an open dispute. Days are counted after the due date (and after the grace period).</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Restrict promoted content after (days)">
              <input className="input" type="number" value={s.overduePolicy.restrictPromotionAfterDays} onChange={(e) => setS({ ...s, overduePolicy: { ...s.overduePolicy, restrictPromotionAfterDays: num(e.target.value) } })} />
            </Field>
            <Field label="Restrict new reels after (days)">
              <input className="input" type="number" value={s.overduePolicy.restrictReelsAfterDays} onChange={(e) => setS({ ...s, overduePolicy: { ...s.overduePolicy, restrictReelsAfterDays: num(e.target.value) } })} />
            </Field>
            <Field label="Suspend after (days)">
              <input className="input" type="number" value={s.overduePolicy.suspendAfterDays} onChange={(e) => setS({ ...s, overduePolicy: { ...s.overduePolicy, suspendAfterDays: num(e.target.value) } })} />
            </Field>
          </div>
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(["invoiceDueDays", "graceDays", "disputeWindowDays", "reminders", "overduePolicy"])}>
          Save billing settings
        </Button>
      </Section>

      <Section title="Currencies">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="LBP per USD (applied to LBP menus, stored on each order)">
            <input className="input" type="number" value={s.lbpPerUsd} onChange={(e) => setS({ ...s, lbpPerUsd: num(e.target.value) })} />
          </Field>
          <Field label="Supported menu currencies">
            <div className="flex gap-4 pt-3 text-sm">
              {["USD", "LBP"].map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="checkbox" checked={s.supportedCurrencies.includes(c)} disabled={c === "USD"} onChange={(e) => setS({ ...s, supportedCurrencies: e.target.checked ? [...s.supportedCurrencies, c] : s.supportedCurrencies.filter((x) => x !== c) })} className="accent-brand-500" /> {c}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(["lbpPerUsd", "supportedCurrencies"])}>
          Save currency settings
        </Button>
      </Section>

      <Section title="Reel views & feed ranking">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Qualified view minimum (ms)">
            <input className="input" type="number" value={s.minViewMs} onChange={(e) => setS({ ...s, minViewMs: num(e.target.value) })} />
          </Field>
          <Field label="View de-dup window (minutes)">
            <input className="input" type="number" value={s.viewDedupeMinutes} onChange={(e) => setS({ ...s, viewDedupeMinutes: num(e.target.value) })} />
          </Field>
          {(["recency", "engagement", "proximity", "category", "featured"] as const).map((k) => (
            <Field key={k} label={`Weight: ${k}`}>
              <input className="input" type="number" step="0.1" value={s.feedWeights[k]} onChange={(e) => setS({ ...s, feedWeights: { ...s.feedWeights, [k]: num(e.target.value) } })} />
            </Field>
          ))}
          <Field label="Recency half-life (hours)">
            <input className="input" type="number" value={s.feedWeights.halfLifeHours} onChange={(e) => setS({ ...s, feedWeights: { ...s.feedWeights, halfLifeHours: num(e.target.value) } })} />
          </Field>
          <Field label="Max consecutive reels per restaurant">
            <input className="input" type="number" value={s.feedWeights.maxConsecutiveSameRestaurant} onChange={(e) => setS({ ...s, feedWeights: { ...s.feedWeights, maxConsecutiveSameRestaurant: Math.max(1, num(e.target.value)) } })} />
          </Field>
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(["minViewMs", "viewDedupeMinutes", "feedWeights"])}>
          Save feed settings
        </Button>
      </Section>

      <Section title="Notification templates" description="Placeholders: {{invoice}} {{period}} {{amount}} {{dueDate}} {{note}}">
        <div className="space-y-4">
          {(Object.keys(s.templates) as (keyof Settings["templates"])[]).map((k) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[180px_1fr_2fr]">
              <div className="pt-3 text-sm font-semibold">{k}</div>
              <input className="input text-sm" value={s.templates[k].title} onChange={(e) => setS({ ...s, templates: { ...s.templates, [k]: { ...s.templates[k], title: e.target.value } } })} />
              <input className="input text-sm" value={s.templates[k].body} onChange={(e) => setS({ ...s, templates: { ...s.templates, [k]: { ...s.templates[k], body: e.target.value } } })} />
            </div>
          ))}
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(["templates"])}>
          Save templates
        </Button>
      </Section>
    </div>
  );
}
