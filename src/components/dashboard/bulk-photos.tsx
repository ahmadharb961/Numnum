"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileArchive, ImagePlus, Loader2, RotateCcw, Trash2, XCircle, Check, Sparkles } from "lucide-react";
import { matchImagesAction, assignPhotoAction, removePhotoAction, deleteLibraryPhotoAction } from "@/actions/menu";
import { suggestByName, IMAGE_EXTENSIONS } from "@/lib/image-match";
import { uploadFile } from "./upload";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Item = { id: string; sku: string; name: string; images: { id: string; assetId: string; isMain: boolean; thumbUrl: string }[] };
type Lib = { id: string; thumbUrl: string; name: string | null; used: number };
type Pending = { file: File; name: string; status: "matched" | "unmatched" | "duplicate" | "unsupported"; menuItemId?: string; itemName?: string; index?: number; suggestion?: { id: string; name: string } | null; acceptSuggestion?: boolean; state: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };

const MAX_FILES = 500;

export function BulkPhotos({ items, library }: { items: Item[]; library: Lib[] }) {
  const t = useT();
  const [tab, setTab] = useState<"bulk" | "assign">("bulk");
  return (
    <div>
      <div className="mb-4 grid max-w-md grid-cols-2 rounded-xl bg-black/5 p-1 text-sm font-semibold">
        <button onClick={() => setTab("bulk")} className={cn("h-10 rounded-lg", tab === "bulk" && "bg-white shadow-sm")}>
          {t("Bulk upload")}
        </button>
        <button onClick={() => setTab("assign")} className={cn("h-10 rounded-lg", tab === "assign" && "bg-white shadow-sm")}>
          {t("Assign photos")}
        </button>
      </div>
      {tab === "bulk" ? <BulkUpload items={items} onDone={() => setTab("assign")} /> : <Assign items={items} library={library} />}
    </div>
  );
}

function BulkUpload({ items, onDone }: { items: Item[]; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const [missing, setMissing] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [busy, setBusy] = useState<"reading" | "uploading" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(list: FileList) {
    setError(null);
    setBusy("reading");
    try {
      const collected: File[] = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(f);
          const entries = Object.values(zip.files).filter((e) => !e.dir && !e.name.includes("__MACOSX") && !e.name.split("/").pop()!.startsWith("."));
          if (entries.length > MAX_FILES) throw new Error(`ZIP has ${entries.length} files; the maximum is ${MAX_FILES}`);
          for (const e of entries) {
            const base = e.name.split("/").pop()!;
            const ext = base.split(".").pop()!.toLowerCase();
            if (!IMAGE_EXTENSIONS.includes(ext)) {
              collected.push(new File([], base));
              continue;
            }
            const blob = await e.async("blob");
            if (blob.size > 15 * 1024 * 1024) throw new Error(`${base} is larger than 15 MB`);
            collected.push(new File([blob], base, { type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" }));
          }
        } else collected.push(f);
      }
      if (collected.length > MAX_FILES) throw new Error(`Select at most ${MAX_FILES} files at a time`);
      const res = await matchImagesAction(collected.map((f) => f.name));
      setMissing(res.stillMissing);
      setFiles(
        res.results.map((r, i) => ({
          file: collected[i],
          name: r.file,
          status: r.status,
          menuItemId: r.menuItemId,
          itemName: r.itemName,
          index: r.index,
          suggestion: r.status === "unmatched" ? suggestByName(r.file, items) : null,
          state: "waiting",
          progress: 0,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => ({ matched: files.filter((f) => f.status === "matched").length, unmatched: files.filter((f) => f.status === "unmatched").length, duplicate: files.filter((f) => f.status === "duplicate").length, unsupported: files.filter((f) => f.status === "unsupported").length }), [files]);

  async function uploadAll() {
    setBusy("uploading");
    const queue = files.map((f, i) => ({ f, i })).filter(({ f }) => (f.status === "matched" || f.status === "unmatched") && f.state !== "done");
    const update = (i: number, patch: Partial<Pending>) => setFiles((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const { f, i } = next;
        update(i, { state: "uploading", progress: 0, error: undefined });
        const target = f.status === "matched" ? f.menuItemId : f.acceptSuggestion ? f.suggestion?.id : undefined;
        try {
          await uploadFile(f.file, "image", { params: target ? { attachTo: target, ...(f.status === "matched" && f.index ? { index: String(f.index) } : {}) } : {}, onProgress: (p) => update(i, { progress: p }) });
          update(i, { state: "done", progress: 100 });
        } catch (e) {
          update(i, { state: "error", error: (e as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(null);
    toast("Upload finished", "success");
    router.refresh();
  }

  const doneCount = files.filter((f) => f.state === "done").length;
  const failed = files.filter((f) => f.state === "error").length;

  return (
    <div className="space-y-4">
      {error && <Alert tone="red">{error}</Alert>}
      {!files.length && (
        <div className="card p-5">
          <button onClick={() => input.current?.click()} disabled={!!busy} className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-black/15 px-6 py-12 text-center hover:border-brand-400">
            {busy ? <Loader2 className="h-10 w-10 animate-spin text-brand-500" /> : <FileArchive className="h-10 w-10 text-brand-500" />}
            <div className="font-bold">{busy ? t("Reading files…") : t("Select photos or a ZIP file")}</div>
            <div className="max-w-md text-sm text-ink-muted">
              {t("Name files with your item SKUs to match automatically:")} <span className="font-mono">{t("BRG001.jpg")}</span>, <span className="font-mono">{t("BRG001_2.jpg")}</span>, <span className="font-mono">{t("BRG001_3.jpg")}</span>{t(". JPG, PNG, WebP (HEIC where supported).")}
            </div>
          </button>
          <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.zip,application/zip" className="hidden" onChange={(e) => e.target.files && onPick(e.target.files)} />
        </div>
      )}
      {files.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Count label={t("Matched")} value={counts.matched} tone="green" />
            <Count label={t("Unmatched")} value={counts.unmatched} tone={counts.unmatched ? "amber" : undefined} />
            <Count label={t("Duplicates")} value={counts.duplicate} />
            <Count label={t("Unsupported")} value={counts.unsupported} tone={counts.unsupported ? "red" : undefined} />
            <Count label={t("Items still missing photos")} value={missing.length} tone={missing.length ? "amber" : "green"} />
          </div>
          <div className="card max-h-[460px] overflow-auto">
            <table className="table-app">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>{t("File")}</th>
                  <th>{t("Match")}</th>
                  <th>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i}>
                    <td className="max-w-[180px] truncate font-mono text-xs">{f.name}</td>
                    <td className="text-sm">
                      {f.status === "matched" && (
                        <span>
                          {f.itemName} {f.index && f.index > 1 && <span className="text-ink-muted">(photo {f.index})</span>}
                        </span>
                      )}
                      {f.status === "unmatched" &&
                        (f.suggestion ? (
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={!!f.acceptSuggestion} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, acceptSuggestion: e.target.checked } : x)))} className="accent-brand-500" />
                            <Sparkles className="h-3.5 w-3.5 text-violet-500" /> {t("Suggested:")} <b>{f.suggestion.name}</b>
                          </label>
                        ) : (
                          <span className="text-xs text-ink-muted">{t("No match — goes to your photo library")}</span>
                        ))}
                      {f.status === "duplicate" && <span className="text-xs text-ink-muted">Duplicate of another file for {f.itemName} — skipped</span>}
                      {f.status === "unsupported" && <span className="text-xs text-red-600">{t("Unsupported file type — skipped")}</span>}
                    </td>
                    <td className="w-40">
                      {f.state === "uploading" && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                          <div className="h-full bg-brand-500" style={{ width: `${f.progress}%` }} />
                        </div>
                      )}
                      {f.state === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      {f.state === "error" && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600" title={f.error}>
                          <XCircle className="h-4 w-4" /> {f.error?.slice(0, 40)}
                        </span>
                      )}
                      {f.state === "waiting" && (f.status === "matched" || f.status === "unmatched") && <Badge>{t("Ready")}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && (
            <details className="card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">{missing.length} items will still have no photo</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {missing.map((m) => (
                  <li key={m.id}>
                    <span className="font-mono text-xs text-ink-muted">{m.sku}</span> {m.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-3">
            {doneCount < counts.matched + counts.unmatched && (
              <Button onClick={uploadAll} loading={busy === "uploading"}>
                {failed ? <RotateCcw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />} {failed ? t("Retry {n} failed", { n: failed }) : t("Upload {n} photos", { n: counts.matched + counts.unmatched })}
              </Button>
            )}
            {doneCount > 0 && busy === null && (
              <Button variant="secondary" onClick={onDone}>
                {t("Review & assign photos")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setFiles([])} disabled={busy === "uploading"}>
              {t("Start over")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-semibold text-ink-muted">{label}</div>
      <div className={cn("tabular text-xl font-extrabold", tone === "green" && "text-emerald-600", tone === "amber" && "text-amber-600", tone === "red" && "text-red-600")}>{value}</div>
    </div>
  );
}

function Assign({ items, library }: { items: Item[]; library: Lib[] }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(items.find((i) => !i.images.length)?.id ?? items[0]?.id ?? null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [libFilter, setLibFilter] = useState<"unused" | "all">("unused");
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const item = items.find((i) => i.id === sel);
  const assigned = new Set(item?.images.map((i) => i.assetId));
  const libShown = library.filter((l) => libFilter === "all" || l.used === 0 || assigned.has(l.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
      router.refresh();
    });

  async function addToLibrary(list: FileList) {
    const arr = Array.from(list);
    setUploading(arr.length);
    for (const f of arr) {
      try {
        await uploadFile(f, "image");
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
      setUploading((n) => n - 1);
    }
    router.refresh();
  }

  if (!items.length) return <div className="card"><EmptyState title="Add menu items first" body="Import your menu, then assign photos here." /></div>;

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]", pending && "opacity-70")}>
      <div className="card flex max-h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 p-3">
          <span className="text-sm font-bold">{t("1. Select an item")}</span>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-brand-500" /> {t("Missing photos only")}
          </label>
        </div>
        <ul className="flex-1 divide-y divide-black/5 overflow-auto">
          {items
            .filter((i) => !onlyMissing || !i.images.length)
            .map((i) => (
              <li key={i.id}>
                <button onClick={() => setSel(i.id)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-start", sel === i.id ? "bg-brand-50" : "hover:bg-black/[0.02]")}>
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5">
                    {i.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.images[0].thumbUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{i.name}</div>
                    <div className="font-mono text-[11px] text-ink-muted">{i.sku}</div>
                  </div>
                  {i.images.length ? <Badge tone="green">{i.images.length}</Badge> : <Badge tone="amber">0</Badge>}
                </button>
              </li>
            ))}
        </ul>
      </div>
      <div className="space-y-4">
        {item && (
          <div className="card p-3">
            <div className="mb-2 text-sm font-bold">Photos of {item.name}</div>
            {item.images.length ? (
              <div className="flex flex-wrap gap-2">
                {item.images.map((im) => (
                  <div key={im.id} className="relative h-20 w-20 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.thumbUrl} alt="" className="h-full w-full object-cover" />
                    {im.isMain && <span className="absolute start-1 top-1 rounded bg-brand-500 px-1 text-[9px] font-bold text-white">{t("Main")}</span>}
                    <button onClick={() => run(() => removePhotoAction(im.id))} className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" aria-label={t("Remove from item")}>
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{t("No photos yet — tap a photo below to assign it.")}</p>
            )}
            <a href={`/dashboard/menu/items/${item.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600">
              {t("Reorder, crop or set main photo →")}
            </a>
          </div>
        )}
        <div className="card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">{t("2. Tap photos to assign")}</span>
            <div className="flex gap-2">
              <button onClick={() => setLibFilter(libFilter === "all" ? "unused" : "all")} className="chip h-8 text-xs">
                {libFilter === "all" ? t("Show unassigned") : t("Show all")}
              </button>
              <Button size="sm" variant="outline" onClick={() => input.current?.click()} loading={uploading > 0}>
                <ImagePlus className="h-4 w-4" /> {uploading ? t("{n} left", { n: uploading }) : t("Upload")}
              </Button>
            </div>
          </div>
          <input ref={input} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && addToLibrary(e.target.files)} />
          {libShown.length ? (
            <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4 xl:grid-cols-5">
              {libShown.map((l) => {
                const on = assigned.has(l.id);
                return (
                  <div key={l.id} className="relative">
                    <button
                      disabled={!item}
                      onClick={() => {
                        if (!item) return;
                        if (on) {
                          const img = item.images.find((x) => x.assetId === l.id);
                          if (img) run(() => removePhotoAction(img.id));
                        } else run(() => assignPhotoAction(item.id, l.id));
                      }}
                      className={cn("block aspect-square w-full overflow-hidden rounded-lg ring-offset-2 transition", on && "ring-4 ring-brand-500")}
                      title={l.name ?? undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.thumbUrl} alt={l.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                      {on && (
                        <span className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-white">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                    {l.used === 0 && !on && (
                      <button onClick={() => confirm(t("Delete this photo from your library?")) && run(() => deleteLibraryPhotoAction(l.id))} className="absolute bottom-1 end-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" aria-label={t("Delete photo")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">{t("No unassigned photos. Upload some to get started.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
