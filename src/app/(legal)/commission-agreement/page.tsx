import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { AgreementText } from "@/components/agreement-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Restaurant commission agreement" };

export default async function CommissionAgreementPage() {
  const s = await getSettings();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Restaurant commission agreement</h1>
      <AgreementText platformName={s.platformName} rateBps={s.defaultCommissionRateBps} billableEvent={s.billableEvent} dueDays={s.invoiceDueDays} disputeDays={s.disputeWindowDays} graceDays={s.graceDays} version={s.agreementVersion} autoCompleteHours={s.autoCompleteHours} />
    </div>
  );
}
