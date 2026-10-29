import { Badge } from "@/components/ui/misc";

const MAP: Record<string, { label: string; tone: "gray" | "blue" | "amber" | "green" | "red" | "purple" | "brand" }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  ISSUED: { label: "Issued", tone: "blue" },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "amber" },
  PAYMENT_SUBMITTED: { label: "Payment submitted — awaiting verification", tone: "blue" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "amber" },
  PAID: { label: "Paid", tone: "green" },
  OVERDUE: { label: "Overdue", tone: "red" },
  DISPUTED: { label: "Disputed", tone: "purple" },
  ADJUSTED: { label: "Adjusted", tone: "gray" },
  SUBMITTED: { label: "Awaiting verification", tone: "blue" },
  MORE_INFO_REQUESTED: { label: "More info requested", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  OPEN: { label: "Open", tone: "amber" },
  UNDER_REVIEW: { label: "Under review", tone: "blue" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  ACCRUED: { label: "Accrued", tone: "gray" },
  INVOICED: { label: "Invoiced", tone: "blue" },
  VOIDED: { label: "Voided", tone: "red" },
  PENDING: { label: "Pending", tone: "amber" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status.toLowerCase(), tone: "gray" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
