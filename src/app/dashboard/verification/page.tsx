import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { VerificationForm } from "@/components/dashboard/verification-form";
import { Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Verification" };

export default async function VerificationPage() {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  const history = await prisma.restaurantVerification.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" } });
  const latest = history[0];
  const canRequest = ["NOT_REQUESTED", "REJECTED", "INFO_REQUIRED", "REVOKED"].includes(r.verificationStatus);
  return (
    <DashPage title="Verified badge" description="The verified badge tells customers your business identity was confirmed by numnum. It isn't a rating of food quality, and it can't be bought.">
      <Section title="Status" actions={<StatusBadge status={r.verificationStatus === "NOT_REQUESTED" ? "Not requested" : r.verificationStatus === "INFO_REQUIRED" ? "MORE_INFO_REQUESTED" : r.verificationStatus} />}>
        {r.verificationStatus === "APPROVED" && <Alert tone="green">Your restaurant is verified. The badge appears on your profile and reels.</Alert>}
        {r.verificationStatus === "PENDING" && <Alert tone="blue">We&apos;re reviewing your request.</Alert>}
        {latest?.adminNote && (r.verificationStatus === "INFO_REQUIRED" || r.verificationStatus === "REJECTED" || r.verificationStatus === "REVOKED") && <Alert tone={r.verificationStatus === "INFO_REQUIRED" ? "amber" : "red"}>Note from numnum: {latest.adminNote}</Alert>}
        {canRequest && (
          <div className="mt-4">
            <VerificationForm />
          </div>
        )}
      </Section>
      {history.length > 0 && (
        <Section title="History">
          <ul className="divide-y divide-black/5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between py-2">
                <span>{formatDateTime(h.createdAt)}</span>
                <StatusBadge status={h.status === "INFO_REQUIRED" ? "MORE_INFO_REQUESTED" : h.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DashPage>
  );
}
