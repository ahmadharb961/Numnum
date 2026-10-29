import { loadInvoiceForViewer } from "@/server/invoice-access";
import { invoicePdf } from "@/server/invoice-docs";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const inv = await loadInvoiceForViewer((await params).id);
  if (!inv) return new Response("Not found", { status: 404 });
  const bytes = await invoicePdf(inv, (await getSettings()).platformName);
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${inv.number}.pdf"`, "cache-control": "private, no-store" } });
}
