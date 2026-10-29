import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { CsvImporter } from "@/components/dashboard/csv-importer";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Import menu" };

export default async function ImportPage() {
  const ctx = await requireRestaurant("MANAGER");
  const history = await prisma.menuImport.findMany({ where: { restaurantId: ctx.restaurant.id }, orderBy: { createdAt: "desc" }, take: 5 });
  return (
    <DashPage title="Import menu from CSV" description="Upload your whole menu at once. Re-upload anytime to update prices and descriptions — photos, reels and reviews are kept.">
      <CsvImporter currency={ctx.restaurant.currency} />
      {history.length > 0 && (
        <div className="card mt-6 p-4">
          <h2 className="mb-2 font-bold">Recent imports</h2>
          <ul className="divide-y divide-black/5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-semibold">{h.fileName}</span>
                <span className="text-ink-muted">
                  {formatDateTime(h.createdAt)} · {h.created} created · {h.updated} updated · {h.skipped} skipped
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashPage>
  );
}
