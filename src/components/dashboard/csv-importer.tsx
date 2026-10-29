"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { CSV_FIELDS, decodeCsvBytes, errorReportCsv, MAX_CSV_BYTES, type ColumnMapping, type ImportRow } from "@/lib/csv-import";
import { formatMoney } from "@/lib/money";
import { validateCsvAction, commitCsvAction, archiveItemsAction } from "@/actions/menu";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Validation = {
  headers: string[];
  mapping: ColumnMapping;
  rows: ImportRow[];
  fileErrors: string[];
  missingFromFile: { id: string; sku: string; name: string }[];
  stats: { total: number; valid: number; invalid: number; warnings: number; creates: number; updates: number };
};

const STEPS = ["Upload", "Map columns", "Review", "Done"];

export function CsvImporter({ currency }: { currency: string }) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [v, setV] = useState<Validation | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "errors" | "warnings">("all");
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; missingFromFile: { id: string; sku: string; name: string }[] } | null>(null);
  const [archiveSel, setArchiveSel] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    setError(null);
    if (f.size > MAX_CSV_BYTES) return setError("File is larger than 5 MB. Split it into smaller files.");
    if (!/\.(csv|txt)$/i.test(f.name)) return setError("Please upload a .csv file (in Excel: File → Save As → CSV UTF-8).");
    const decoded = decodeCsvBytes(new Uint8Array(await f.arrayBuffer()));
    if (!decoded.ok) return setError(decoded.error);
    setFileName(f.name);
    setText(decoded.text);
    setBusy(true);
    const res = await validateCsvAction(decoded.text);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setV(res.data);
    setMapping(res.data.mapping);
    setStep(1);
  }

  async function revalidate() {
    setBusy(true);
    const res = await validateCsvAction(text, mapping);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setV(res.data);
    setStep(2);
  }

  async function commit() {
    setBusy(true);
    setError(null);
    const res = await commitCsvAction(fileName, text, mapping);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setResult(res.data);
    setStep(3);
  }

  function downloadReport() {
    if (!v) return;
    const blob = new Blob(["﻿" + errorReportCsv(v.rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.\w+$/, "") + "-errors.csv";
    a.click();
  }

  const rows = v?.rows.filter((r) => (filter === "errors" ? r.errors.length : filter === "warnings" ? r.warnings.length : true)) ?? [];

  return (
    <div>
      <ol className="mb-5 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full px-3 py-1 text-xs font-bold", i === step ? "bg-ink text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-black/5 text-ink-muted")}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error && (
        <Alert tone="red" className="mb-4">
          {error}
        </Alert>
      )}

      {step === 0 && (
        <div className="card p-5">
          <button onClick={() => input.current?.click()} disabled={busy} className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/15 px-6 py-12 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
            <FileSpreadsheet className="h-10 w-10 text-brand-500" />
            <div className="font-bold">{busy ? "Reading file…" : "Choose your menu CSV"}</div>
            <div className="text-sm text-ink-muted">UTF-8 encoded, up to 5 MB and 5,000 items. Arabic text is supported.</div>
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-4 text-sm">
            <div>
              <div className="font-semibold">Need a template?</div>
              <div className="text-ink-muted">Columns: SKU, category, item name, description, ingredients, price, currency, availability, image filename, allergens, dietary labels, preparation time.</div>
            </div>
            <a href="/api/menu/sample-csv" className={buttonClass("outline", "sm")}>
              <Download className="h-4 w-4" /> Sample CSV
            </a>
          </div>
        </div>
      )}

      {step === 1 && v && (
        <div className="card p-5">
          <h2 className="font-bold">Match your columns</h2>
          <p className="mb-4 text-sm text-ink-muted">We detected {v.headers.length} columns in “{fileName}”. Check each field points to the right column.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CSV_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="label">
                  {f.label} {f.required && <span className="text-brand-600">*</span>}
                </span>
                <select className="input" value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}>
                  <option value="">— Not in file —</option>
                  {v.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={revalidate} loading={busy}>
              Validate {v.stats.total} rows
            </Button>
          </div>
        </div>
      )}

      {step === 2 && v && (
        <div className="space-y-4">
          {v.fileErrors.length > 0 && (
            <Alert tone="red">
              {v.fileErrors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={v.stats.total} />
            <Stat label="Ready" value={v.stats.valid} tone="green" sub={`${v.stats.creates} new · ${v.stats.updates} updates`} />
            <Stat label="With errors" value={v.stats.invalid} tone={v.stats.invalid ? "red" : undefined} sub="Will be skipped" />
            <Stat label="Warnings" value={v.stats.warnings} tone={v.stats.warnings ? "amber" : undefined} />
          </div>
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
              <div className="flex gap-2">
                {(["all", "errors", "warnings"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn("chip h-8 text-xs capitalize", filter === f && "chip-active")}>
                    {f}
                  </button>
                ))}
              </div>
              {(v.stats.invalid > 0 || v.stats.warnings > 0) && (
                <Button size="sm" variant="outline" onClick={downloadReport}>
                  <Download className="h-4 w-4" /> Error report
                </Button>
              )}
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="table-app">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.row} className={r.errors.length ? "bg-red-50/50" : ""}>
                      <td className="tabular text-ink-muted">{r.row}</td>
                      <td>{r.errors.length ? <XCircle className="h-4 w-4 text-red-500" /> : r.warnings.length ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</td>
                      <td className="font-mono text-xs">{r.sku}</td>
                      <td className="max-w-[200px] truncate">
                        {r.name} {r.action === "update" && !r.errors.length && <Badge tone="blue">update</Badge>}
                      </td>
                      <td>{r.category}</td>
                      <td className="tabular">{r.priceCents != null ? formatMoney(r.priceCents, currency) : "—"}</td>
                      <td className="text-xs">
                        {r.errors.map((e) => (
                          <div key={e} className="text-red-600">
                            {e}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="text-amber-700">
                            {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 500 && <p className="p-3 text-center text-xs text-ink-muted">Showing first 500 rows. Download the error report for the full list.</p>}
            </div>
          </div>
          {v.missingFromFile.length > 0 && v.stats.updates > 0 && (
            <Alert tone="blue">
              {v.missingFromFile.length} existing item(s) aren't in this file. They will <b>not</b> be deleted — you can review them after importing.
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back to mapping
            </Button>
            <Button variant="outline" onClick={() => { setStep(0); setV(null); }}>
              Upload corrected file
            </Button>
            <Button onClick={commit} loading={busy} disabled={!v.stats.valid || v.fileErrors.length > 0}>
              <Upload className="h-4 w-4" /> Import {v.stats.valid} items
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-3 text-xl font-extrabold">Menu imported</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {result.created} created · {result.updated} updated · {result.skipped} skipped
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard/menu/photos" className={buttonClass("primary", "md")}>
                Continue to photo upload
              </Link>
              <Link href="/dashboard/menu" className={buttonClass("outline", "md")}>
                View menu
              </Link>
            </div>
          </div>
          {result.missingFromFile.length > 0 && archived === null && (
            <div className="card p-5">
              <h3 className="font-bold">Items not in this file</h3>
              <p className="mb-3 text-sm text-ink-muted">These items are still on your menu. Select any you want to archive (hidden from customers; history, photos and reviews kept).</p>
              <ul className="max-h-72 divide-y divide-black/5 overflow-auto rounded-xl border border-black/5">
                {result.missingFromFile.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-500"
                        checked={archiveSel.has(m.id)}
                        onChange={(e) => {
                          const s = new Set(archiveSel);
                          if (e.target.checked) s.add(m.id);
                          else s.delete(m.id);
                          setArchiveSel(s);
                        }}
                      />
                      <span className="font-mono text-xs text-ink-muted">{m.sku}</span>
                      <span>{m.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!archiveSel.size}
                  onClick={async () => {
                    if (!confirm(`Archive ${archiveSel.size} item(s)?`)) return;
                    const r = await archiveItemsAction(Array.from(archiveSel));
                    if (r.ok) setArchived(r.data ?? 0);
                  }}
                >
                  Archive selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setArchived(0)}>
                  Keep all
                </Button>
              </div>
            </div>
          )}
          {archived !== null && archived > 0 && <Alert tone="green">{archived} item(s) archived.</Alert>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "green" | "red" | "amber" }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-semibold text-ink-muted">{label}</div>
      <div className={cn("tabular text-2xl font-extrabold", tone === "green" && "text-emerald-600", tone === "red" && "text-red-600", tone === "amber" && "text-amber-600")}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
