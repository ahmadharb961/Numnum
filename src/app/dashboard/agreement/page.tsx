import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { DashPage, Section } from "@/components/dashboard/page";
import { AgreementText } from "@/components/agreement-text";
import { AcceptAgreement } from "@/components/dashboard/simple-actions";
import { Alert } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Commission agreement") };
}

export default async function AgreementPage() {
  const t = await getT();
  const lang = await getLocale();
  const ctx = await requireRestaurant();
  const s = await getSettings();
  const r = ctx.restaurant;
  const outdated = r.agreementAcceptedAt && r.agreementVersion !== s.agreementVersion;
  return (
    <DashPage title={t("Commission agreement")}>
      {r.agreementAcceptedAt && !outdated && (
        <Alert tone="green" className="mb-4">
          Accepted on {formatDateTime(r.agreementAcceptedAt, lang)} (version {r.agreementVersion}).
        </Alert>
      )}
      {outdated && <Alert className="mb-4">The agreement has been updated since you accepted version {r.agreementVersion}. Please review and accept the new version.</Alert>}
      <Section title={t("Terms")}>
        <AgreementText platformName={s.platformName} rateBps={r.commissionRateBps ?? s.defaultCommissionRateBps} billableEvent={s.billableEvent} dueDays={s.invoiceDueDays} disputeDays={s.disputeWindowDays} graceDays={s.graceDays} version={s.agreementVersion} autoCompleteHours={s.autoCompleteHours} />
        {(!r.agreementAcceptedAt || outdated) && <div className="mt-6">{ctx.staffRole === "OWNER" ? <AcceptAgreement /> : <p className="text-sm text-ink-muted">{t("Only the restaurant owner can accept the agreement.")}</p>}</div>}
      </Section>
    </DashPage>
  );
}
