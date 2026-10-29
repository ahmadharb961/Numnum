import { loadInvoiceForViewer } from "@/server/invoice-access";
import { statementCsv } from "@/server/invoice-docs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const inv = await loadInvoiceForViewer((await params).id);
  if (!inv) return new Response("Not found", { status: 404 });
  return new Response(statementCsv(inv), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${inv.number}-statement.csv"`, "cache-control": "private, no-store" } });
}
