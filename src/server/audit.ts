import { prisma, type Tx } from "./db";

export async function audit(
  entry: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; data?: unknown; ipHash?: string | null },
  tx?: Tx,
) {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      data: (entry.data ?? undefined) as object | undefined,
      ipHash: entry.ipHash ?? null,
    },
  });
}
