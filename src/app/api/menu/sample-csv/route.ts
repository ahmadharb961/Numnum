import { SAMPLE_CSV } from "@/lib/csv-import";

export function GET() {
  return new Response("﻿" + SAMPLE_CSV + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="numnum-menu-template.csv"' } });
}
