import { searchIndex } from "@/server/search-index";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const idx = await searchIndex();
  const gzip = /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "");
  return new Response(gzip ? new Uint8Array(idx.gzip) : idx.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(gzip ? { "Content-Encoding": "gzip" } : {}),
      Vary: "Accept-Encoding",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
    },
  });
}
