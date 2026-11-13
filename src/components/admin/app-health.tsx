import { prisma } from "@/server/db";
import { Section } from "@/components/dashboard/page";
import { formatDateTime } from "@/lib/utils";

type Report = { path: string; message: string; stack?: string | null; hydration?: boolean; serverOnly?: string[]; clientOnly?: string[]; ua?: string };

/** Page errors reported by customers' phones in the last 14 days, grouped by error and page. */
export async function AppHealth() {
  const rows = await prisma.analyticsEvent.findMany({ where: { type: "client_error", createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } }, orderBy: { createdAt: "desc" }, take: 300, select: { createdAt: true, deviceKey: true, data: true } });
  const groups = new Map<string, { r: Report; count: number; devices: Set<string>; last: Date }>();
  for (const row of rows) {
    const r = row.data as Report;
    const key = `${r.message}|${r.path.split("?")[0]}`;
    const g = groups.get(key) ?? { r, count: 0, devices: new Set<string>(), last: row.createdAt };
    g.count++;
    if (row.deviceKey) g.devices.add(row.deviceKey);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  return (
    <Section title="App health" description="Errors on customers' phones in the last 14 days. Each one comes with the page and what went wrong, so it can be fixed.">
      {!list.length ? (
        <p className="text-sm font-semibold text-green-700" data-testid="app-health-ok">
          ✓ No errors reported.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="app-health-list">
          {list.slice(0, 20).map(({ r, count, devices, last }) => (
            <li key={`${r.message}|${r.path}`} className="rounded-xl bg-cream p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="break-all">{r.hydration ? "Page drawn differently on the phone (React #418)" : r.message}</b>
                <span className="text-xs text-ink-muted">
                  {count}× · {devices.size} device{devices.size === 1 ? "" : "s"} · last {formatDateTime(last)}
                </span>
              </div>
              <div className="mt-1 break-all font-mono text-xs text-ink-muted">{r.path}</div>
              {r.hydration && (r.serverOnly?.length || r.clientOnly?.length) ? (
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <div className="font-semibold">Server sent</div>
                    <div className="break-all font-mono">{r.serverOnly?.join(" · ") || "—"}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Phone drew</div>
                    <div className="break-all font-mono">{r.clientOnly?.join(" · ") || "—"}</div>
                  </div>
                </div>
              ) : null}
              {r.ua && <div className="mt-1 truncate text-[11px] text-ink-muted">{r.ua}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
