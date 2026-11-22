import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      ...(process.env.NODE_ENV === "development" ? [{ emit: "stdout" as const, level: "warn" as const }] : []),
    ],
  });
  // Database errors go to the server log, except the one the app expects and handles: the same
  // order sent twice at once (a double tap, a retry) is stopped by the unique idempotency key, and
  // every tap gets the one order. Logging those would bury real errors.
  client.$on("error", (e) => {
    if (/Unique constraint failed on the fields: \(`idempotencyKey`\)/.test(e.message)) return;
    console.error("prisma:error", e.message);
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
