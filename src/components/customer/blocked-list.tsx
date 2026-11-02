"use client";

import { useState } from "react";
import { Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "./track";
import { useT } from "@/i18n/client";

export function BlockedList({ rows: initial }: { rows: { id: string; label: string; kind: "restaurant" | "user" }[] }) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  if (!rows.length) return <div className="card"><EmptyState title={t("You haven't blocked anyone")} /></div>;
  return (
    <ul className="card divide-y divide-black/5" data-testid="blocked-list">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/5">{r.kind === "restaurant" ? <Store className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</span>
          <span className="flex-1">
            <span className="block font-semibold">{r.label}</span>
            <span className="block text-xs text-ink-muted">{r.kind === "restaurant" ? t("Restaurant") : t("Reviewer")}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await api("/api/blocks", { id: r.id }, "DELETE");
              setRows((x) => x.filter((y) => y.id !== r.id));
              toast(t("Unblocked"), "success");
            }}
          >
            {t("Unblock")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
