import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { durationLabel } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { updateSettingsAction } from "../actions";

export const metadata = { title: "Settings" };

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-4xl bg-white p-6 shadow-card ring-1 ring-ink/5">
      <div>
        <h2 className="font-bold">{title}</h2>
        {sub && <p className="text-sm text-ink-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <ActionForm action={updateSettingsAction} className="space-y-5">
        <Card title="Listing fee" sub="What posters pay Yalla Ok to publish after their free posts. Not the task reward.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Fee per task" htmlFor="posting_fee">
              <input id="posting_fee" name="posting_fee" inputMode="decimal" defaultValue={(s.posting_fee_cents / 100).toString()} className={inputClass} />
            </Field>
            <Field label="Currency" htmlFor="currency">
              <input id="currency" name="currency" defaultValue={s.currency} maxLength={3} className={`${inputClass} uppercase`} />
            </Field>
            <Field label="Free posts per user" htmlFor="free_posts">
              <input id="free_posts" name="free_posts" type="number" min={0} defaultValue={s.free_posts} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card title="Whish payment details" sub="Shown to posters on the payment screen.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Whish number / account" htmlFor="whish_number">
              <input id="whish_number" name="whish_number" defaultValue={s.whish_number} className={inputClass} />
            </Field>
            <Field label="Account name" htmlFor="whish_account_name">
              <input id="whish_account_name" name="whish_account_name" defaultValue={s.whish_account_name} className={inputClass} />
            </Field>
          </div>
          <Field label="Payment instructions" htmlFor="payment_instructions">
            <textarea id="payment_instructions" name="payment_instructions" rows={4} maxLength={1000} defaultValue={s.payment_instructions} className={inputClass} />
          </Field>
        </Card>

        <Card title="Deadlines" sub="Countdown options posters can choose, in minutes.">
          <Field
            label="Allowed durations (minutes, comma separated)"
            htmlFor="allowed_durations"
            hint={`Currently: ${s.allowed_durations.map(durationLabel).join(", ")}`}
          >
            <input id="allowed_durations" name="allowed_durations" defaultValue={s.allowed_durations.join(", ")} className={inputClass} />
          </Field>
        </Card>

        <Card title="Moderation & limits">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="auto_publish" defaultChecked={s.auto_publish} className="mt-1 h-5 w-5 accent-brand-500" />
            <span>
              <span className="font-semibold">Publish free tasks instantly</span>
              <span className="block text-sm text-ink-muted">
                Suspicious tasks are always held for review. Turn this off to review every free task first.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max tasks per user / hour" htmlFor="max_tasks_per_hour">
              <input id="max_tasks_per_hour" name="max_tasks_per_hour" type="number" min={1} defaultValue={s.max_tasks_per_hour} className={inputClass} />
            </Field>
            <Field label="Max tasks per user / day" htmlFor="max_tasks_per_day">
              <input id="max_tasks_per_day" name="max_tasks_per_day" type="number" min={1} defaultValue={s.max_tasks_per_day} className={inputClass} />
            </Field>
          </div>
          <Field label="Blocked words" htmlFor="blocked_words" hint="One per line. Tasks containing them are held for review.">
            <textarea id="blocked_words" name="blocked_words" rows={3} defaultValue={s.blocked_words.join("\n")} className={inputClass} />
          </Field>
        </Card>

        <Card title="Homepage & branding">
          <Field label="Brand name" htmlFor="brand_name">
            <input id="brand_name" name="brand_name" defaultValue={s.brand_name} maxLength={40} className={inputClass} />
          </Field>
          <Field label="Headline" htmlFor="hero_title">
            <input id="hero_title" name="hero_title" defaultValue={s.hero_title} maxLength={80} className={inputClass} />
          </Field>
          <Field label="Subheading" htmlFor="hero_subtitle">
            <textarea id="hero_subtitle" name="hero_subtitle" rows={2} maxLength={200} defaultValue={s.hero_subtitle} className={inputClass} />
          </Field>
        </Card>

        <div className="sticky bottom-4 z-10">
          <SubmitButton className={`${buttonClass.primary} w-full`} pendingText="Saving…">
            Save settings
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
