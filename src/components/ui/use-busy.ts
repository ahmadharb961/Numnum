"use client";

import { useState, useTransition } from "react";

/**
 * One pending state shared by several buttons: only the button that was pressed spins, the others
 * are just disabled until it finishes (so nothing is sent twice).
 *   const b = useBusy();
 *   <Button loading={b.is("save")} disabled={b.pending} onClick={() => b.run("save", async () => …)} />
 */
export function useBusy() {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  return {
    pending,
    is: (id: string) => pending && which === id,
    run: (id: string, fn: () => Promise<void>) => {
      setWhich(id);
      start(fn);
    },
  };
}
