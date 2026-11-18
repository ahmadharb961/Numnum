import { Badge } from "@/components/ui/misc";
import type { AccountRow } from "@/server/admin-people";

const CREATOR_TONE = { APPROVED: "brand", PENDING: "amber", DECLINED: "gray", SUSPENDED: "red" } as const;
const CREATOR_LABEL = { APPROVED: "Food creator", PENDING: "Creator: applied", DECLINED: "Creator: declined", SUSPENDED: "Creator: suspended" } as const;

/** What an account is on numnum: customer, food creator, restaurant (owner/staff of which), admin, disabled. */
export function AccountBadges({ a }: { a: Pick<AccountRow, "roles" | "staff" | "creator" | "disabled"> }) {
  const admin = a.roles.some((r) => r.role === "ADMIN");
  const plain = !admin && !a.staff.length && !a.creator;
  return (
    <span className="flex flex-wrap gap-1" data-testid="account-badges">
      {a.disabled && <Badge tone="red">Disabled</Badge>}
      {admin && <Badge tone="purple">Admin</Badge>}
      {a.staff.map((s) => (
        <Badge key={s.restaurant.id} tone="blue">
          {`${s.role === "OWNER" ? "Owner" : s.role === "MANAGER" ? "Manager" : "Staff"} · ${s.restaurant.displayName}`}
        </Badge>
      ))}
      {a.creator && <Badge tone={CREATOR_TONE[a.creator.status]}>{`${CREATOR_LABEL[a.creator.status]} · @${a.creator.handle}`}</Badge>}
      {plain && <Badge tone="green">Customer</Badge>}
    </span>
  );
}
