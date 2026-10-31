import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { AgreementText } from "@/components/agreement-text";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Restaurant commission agreement") };
}

export default async function CommissionAgreementPage() {
  const t = await getT();
  const s = await getSettings();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">{t("Restaurant commission agreement")}</h1>
      <AgreementText platformName={s.platformName} rateBps={s.defaultCommissionRateBps} billableEvent={s.billableEvent} dueDays={s.invoiceDueDays} disputeDays={s.disputeWindowDays} graceDays={s.graceDays} version={s.agreementVersion} autoCompleteHours={s.autoCompleteHours} />
    </div>
  );
}
