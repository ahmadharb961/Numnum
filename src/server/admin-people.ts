import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { deletionBlocker, eraseAccount } from "./account-deletion";
import { normalizeMobile } from "@/lib/phone";

// Admin → Customers: every account (customers, food creators, restaurant people, admins), what each
// one is on numnum, and editing, disabling or deleting them.

export const ACCOUNT_KINDS = ["customer", "creator", "restaurant", "admin", "disabled"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

const kindWhere: Record<AccountKind, Prisma.UserWhereInput> = {
  customer: { staff: { none: {} }, creator: null, roles: { none: { role: "ADMIN" } } },
  creator: { creator: { isNot: null } },
  restaurant: { staff: { some: {} } },
  admin: { roles: { some: { role: "ADMIN" } } },
  disabled: { disabled: true },
};

const listSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  lastLoginAt: true,
  disabled: true,
  roles: { select: { role: true } },
  staff: { select: { role: true, restaurant: { select: { id: true, displayName: true } } } },
  creator: { select: { handle: true, status: true } },
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

export async function listAccounts(q: string | undefined, kind: AccountKind | undefined) {
  const term = q?.trim();
  const digits = term?.replace(/\D/g, "");
  const where: Prisma.UserWhereInput = {
    ...(kind ? kindWhere[kind] : {}),
    ...(term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []), { creator: { handle: { contains: term.replace(/^@/, "").toLowerCase() } } }] }
      : {}),
  };
  const [list, total, all, counts] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: listSelect }),
    prisma.user.count({ where }),
    prisma.user.count(),
    Promise.all(ACCOUNT_KINDS.map((k) => prisma.user.count({ where: kindWhere[k] }))),
  ]);
  return { list, total, all, counts: Object.fromEntries(ACCOUNT_KINDS.map((k, i) => [k, counts[i]])) as Record<AccountKind, number> };
}

export type AccountRow = Awaited<ReturnType<typeof listAccounts>>["list"][number];

export async function getAccount(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      ...listSelect,
      locale: true,
      emailVerifiedAt: true,
      creator: { select: { id: true, handle: true, displayName: true, status: true, followerCount: true, avatarUrl: true, verification: true, _count: { select: { reels: true } } } },
      _count: { select: { orders: true, addresses: true, follows: true, creatorFollows: true, pushSubs: true } },
    },
  });
  if (!u) return null;
  const [orders, blocker] = await Promise.all([
    prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, reference: true, status: true, totalCents: true, currency: true, createdAt: true, restaurantName: true } }),
    deletionBlocker(id),
  ]);
  return { ...u, orders, blocker };
}

export class AccountError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** Name and phone (the login email has its own action: it may need confirming again). */
export async function updateAccount(adminId: string, id: string, input: { name: string; phone: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new AccountError("Enter their name", "name");
  let phone: string | null = null;
  if (input.phone.trim()) {
    const p = normalizeMobile(input.phone);
    if (!p.ok) throw new AccountError(p.error, "phone");
    phone = p.e164;
  }
  const before = await prisma.user.findUnique({ where: { id }, select: { name: true, phone: true } });
  if (!before) throw new AccountError("Account not found");
  await prisma.user.update({ where: { id }, data: { name, phone } });
  await audit({ actorId: adminId, action: "user.admin_edit", entityType: "user", entityId: id, data: { from: before, to: { name, phone } } });
}

/** Disabled accounts can't log in (their open sessions stop working at once). Admins can't be disabled here. */
export async function setAccountDisabled(adminId: string, id: string, disabled: boolean) {
  if (id === adminId) throw new AccountError("You can't disable your own account");
  const u = await prisma.user.findUnique({ where: { id }, select: { roles: { select: { role: true } } } });
  if (!u) throw new AccountError("Account not found");
  if (u.roles.some((r) => r.role === "ADMIN")) throw new AccountError("Admin accounts can't be disabled here");
  await prisma.user.update({ where: { id }, data: { disabled } });
  if (disabled) await prisma.session.deleteMany({ where: { userId: id } });
  await audit({ actorId: adminId, action: disabled ? "user.disable" : "user.enable", entityType: "user", entityId: id });
}

/** Deletes an account like "Delete my account" does. Restaurant owners, admins and open orders block it. */
export async function adminDeleteAccount(adminId: string, id: string) {
  if (id === adminId) throw new AccountError("You can't delete your own account");
  const block = await deletionBlocker(id);
  if (!block.ok)
    throw new AccountError(
      block.reason === "owner"
        ? `They own ${block.restaurants?.join(", ")}. Close or hand over the restaurant first.`
        : block.reason === "admin"
          ? "Admin accounts can't be deleted"
          : "They have an order in progress. Delete the account once it's finished.",
    );
  await eraseAccount(id, adminId);
}
