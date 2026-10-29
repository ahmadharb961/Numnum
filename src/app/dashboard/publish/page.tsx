import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { onboardingChecklist } from "@/server/restaurants";
import { getSettings } from "@/server/settings";
import { DashPage, Section } from "@/components/dashboard/page";
import { PublishButton } from "@/components/dashboard/simple-actions";
import { Alert } from "@/components/ui/misc";

export const metadata = { title: "Publish" };

export default async function PublishPage() {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  const [steps, s] = await Promise.all([onboardingChecklist(r.id), getSettings()]);
  const required = steps.filter((x) => ["whatsapp", "menu", "agreement"].includes(x.key));
  const ready = required.every((x) => x.done);
  return (
    <DashPage title="Publish your restaurant">
      {r.status === "ACTIVE" && <Alert tone="green" className="mb-4">Your profile is live. <Link href={`/r/${r.slug}`} className="font-semibold underline">View it</Link></Alert>}
      {r.status === "PENDING_APPROVAL" && <Alert className="mb-4">Your profile is waiting for approval by the numnum team. We&apos;ll notify you here.</Alert>}
      <Section title="Review before going live">
        <ul className="mb-5 space-y-2">
          {steps.filter((x) => x.key !== "publish").map((x) => (
            <li key={x.key}>
              <Link href={x.href} className="flex items-center gap-3 text-sm">
                {x.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-ink-muted/40" />}
                <span className={x.done ? "" : "font-semibold"}>{x.label}</span>
                {["whatsapp", "menu", "agreement"].includes(x.key) && !x.done && <span className="text-xs font-semibold text-brand-600">required</span>}
              </Link>
            </li>
          ))}
        </ul>
        {(r.status === "DRAFT" || r.status === "PENDING_APPROVAL") && (
          <>
            <p className="mb-3 text-sm text-ink-muted">{s.requireRestaurantApproval ? "New restaurants are reviewed by our team (usually within one business day) before appearing to customers." : "Your profile appears to customers as soon as you publish."}</p>
            {r.status === "DRAFT" && <PublishButton disabled={!ready} />}
          </>
        )}
      </Section>
    </DashPage>
  );
}
