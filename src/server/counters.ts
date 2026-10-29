import type { Tx } from "./db";

/** Atomically increments and returns the next value of a named counter (gap-free inside a committed tx). */
export async function nextCounter(tx: Tx, name: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
    RETURNING value`;
  return Number(rows[0].value);
}
