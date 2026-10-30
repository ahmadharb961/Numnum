import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { AUDIENCE_LABELS, audienceStats, type Audience } from "@/server/broadcast";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Push notifications" };
export const dynamic = "force-dynamic";

export default async function PushPage() {
  const [stats, restaurants, history] = await Promise.all([
    audienceStats(),
    prisma.restaurant.findMany({ where: { status: { not: "SUSPENDED" } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, area: true } }),
    prisma.pushBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <DashPage title="Push notifications" description="Send a phone notification to everyone, all customers, all restaurants, one person or one restaurant. It stays on screen until tapped and opens your link.">
      <BroadcastForm stats={stats} restaurants={restaurants.map((r) => ({ id: r.id, name: r.area ? `${r.displayName} · ${r.area}` : r.displayName }))} />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Sent</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing sent yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-app">
              <thead>
                <tr>
                  <th>When</th>
                  <th>To</th>
                  <th>Notification</th>
                  <th className="text-right">People</th>
                  <th className="text-right">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{formatDateTime(h.createdAt)}</td>
                    <td>
                      {AUDIENCE_LABELS[h.audience as Audience] ?? h.audience}
                      {h.targetLabel && <div className="text-xs text-ink-muted">{h.targetLabel}</div>}
                    </td>
                    <td className="max-w-md">
                      <div className="font-semibold">{h.title || "numnum"}</div>
                      {h.body && <div className="line-clamp-2 text-xs text-ink-muted">{h.body}</div>}
                      {h.link && <div className="truncate text-xs text-brand-600">{h.link}</div>}
                    </td>
                    <td className="text-right tabular">{h.recipients}</td>
                    <td className="text-right tabular">
                      {h.delivered}/{h.devices} devices
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashPage>
  );
}
