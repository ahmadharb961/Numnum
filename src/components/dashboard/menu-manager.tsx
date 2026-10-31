"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Archive, Film, ImageOff, Pencil, Search, Trash2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { archiveItemsAction, deleteCategoryAction, moveCategoryAction, restoreItemAction, saveCategoryAction, toggleAvailabilityAction } from "@/actions/menu";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState, Badge } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

type Item = { id: string; sku: string; name: string; priceCents: number; currency: string; available: boolean; menuCategoryId: string | null; ratingAvg: number; ratingCount: number; image: string | null; _count: { images: number; reels: number; customizations: number } };
type Cat = { id: string; name: string; count: number };

export function MenuManager({ items, categories, manager, showArchived }: { items: Item[]; categories: Cat[]; manager: boolean; showArchived: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editCats, setEditCats] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const filtered = useMemo(() => items.filter((i) => (cat === "all" || (cat === "none" ? !i.menuCategoryId : i.menuCategoryId === cat)) && (!q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()))), [items, q, cat]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
      else if (r.message) toast(r.message, "success");
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input h-10 ps-9 text-sm" placeholder={t("Search name or SKU")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Link href={showArchived ? "/dashboard/menu" : "/dashboard/menu?archived=1"} className="chip h-10">
          {showArchived ? t("Show active") : t("Show archived")}
        </Link>
        {manager && (
          <button onClick={() => setEditCats((v) => !v)} className={cn("chip h-10", editCats && "chip-active")}>
            <SlidersHorizontal className="h-4 w-4" /> {t("Categories")}
          </button>
        )}
      </div>

      {editCats && <CategoryEditor categories={categories} />}

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <button onClick={() => setCat("all")} className={cn("chip h-8 text-xs", cat === "all" && "chip-active")}>
          {t("All")} ({items.length})
        </button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("chip h-8 text-xs", cat === c.id && "chip-active")}>
            {c.name}
          </button>
        ))}
        {items.some((i) => !i.menuCategoryId) && (
          <button onClick={() => setCat("none")} className={cn("chip h-8 text-xs", cat === "none" && "chip-active")}>
            {t("Uncategorized")}
          </button>
        )}
      </div>

      {selected.size > 0 && manager && !showArchived && (
        <div className="sticky top-16 z-20 mb-3 flex items-center justify-between rounded-xl bg-ink px-4 py-2.5 text-sm text-white lg:top-3">
          <span>{selected.size} selected</span>
          <div className="flex gap-2">
            <button className="font-semibold" onClick={() => setSelected(new Set())}>
              {t("Clear")}
            </button>
            <button
              className="inline-flex items-center gap-1 font-semibold text-brand-300"
              onClick={() => {
                if (!confirm(t("Archive {n} item(s)? They'll be hidden from customers. Reviews, photos and order history are kept.", { n: selected.size }))) return;
                run(async () => {
                  const r = await archiveItemsAction(Array.from(selected));
                  setSelected(new Set());
                  return r;
                });
              }}
            >
              <Archive className="h-4 w-4" /> {t("Archive")}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title={items.length ? "No matching items" : "Your menu is empty"} body={items.length ? undefined : "Import your menu from a CSV file or add items one by one."} action={!items.length && manager ? <Link href="/dashboard/menu/import" className="chip chip-active">{t("Import CSV")}</Link> : undefined} />
        </div>
      ) : (
        <ul className={cn("card divide-y divide-black/5", pending && "opacity-70")}>
          {filtered.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3">
              {manager && !showArchived && (
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand-500"
                  checked={selected.has(i.id)}
                  onChange={(e) => {
                    const s = new Set(selected);
                    if (e.target.checked) s.add(i.id);
                    else s.delete(i.id);
                    setSelected(s);
                  }}
                  aria-label={t("Select {name}", { name: i.name })}
                />
              )}
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/5">
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center text-ink-muted/50">
                    <ImageOff className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span className="font-mono">{i.sku}</span>
                  <span className="tabular font-semibold text-ink">{formatMoney(i.priceCents, i.currency)}</span>
                  {i._count.reels > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Film className="h-3 w-3" />
                      {i._count.reels}
                    </span>
                  )}
                  {i._count.customizations > 0 && <span>{t("{n} options", { n: i._count.customizations })}</span>}
                  {i._count.images === 0 && <Badge tone="amber">{t("No photo")}</Badge>}
                </div>
              </div>
              {showArchived ? (
                manager && (
                  <Button size="sm" variant="outline" onClick={() => run(() => restoreItemAction(i.id))}>
                    <RotateCcw className="h-4 w-4" /> {t("Restore")}
                  </Button>
                )
              ) : (
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-muted">
                  <span className="hidden sm:inline">{i.available ? t("Available") : t("Sold out")}</span>
                  <input type="checkbox" className="peer sr-only" checked={i.available} onChange={(e) => run(() => toggleAvailabilityAction(i.id, e.target.checked))} />
                  <span className="relative h-6 w-11 rounded-full bg-black/15 transition peer-checked:bg-emerald-500 after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5" />
                </label>
              )}
              {manager && !showArchived && (
                <Link href={`/dashboard/menu/items/${i.id}`} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5" aria-label={t("Edit {name}", { name: i.name })}>
                  <Pencil className="h-4 w-4" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryEditor({ categories }: { categories: Cat[] }) {
  const t = useT();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
    });
  return (
    <div className={cn("card mb-4 p-4", pending && "opacity-70")}>
      <h3 className="mb-3 font-bold">{t("Menu categories")}</h3>
      <ul className="divide-y divide-black/5">
        {categories.map((c, idx) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            {editing === c.id ? (
              <>
                <input className="input h-9 flex-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Button size="sm" onClick={() => run(async () => { const r = await saveCategoryAction(c.id, editName); if (r.ok) setEditing(null); return r; })}>
                  {t("Save")}
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-semibold">
                  {c.name} <span className="font-normal text-ink-muted">({c.count})</span>
                </span>
                <button disabled={idx === 0} onClick={() => run(() => moveCategoryAction(c.id, -1))} className="grid h-8 w-8 place-items-center rounded disabled:opacity-30" aria-label={t("Move up")}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button disabled={idx === categories.length - 1} onClick={() => run(() => moveCategoryAction(c.id, 1))} className="grid h-8 w-8 place-items-center rounded disabled:opacity-30" aria-label={t("Move down")}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditing(c.id); setEditName(c.name); }} className="grid h-8 w-8 place-items-center rounded" aria-label={t("Rename")}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => confirm(t("Delete “{name}”? Items stay on the menu without a category.", { name: c.name })) && run(() => deleteCategoryAction(c.id))} className="grid h-8 w-8 place-items-center rounded text-red-600" aria-label={t("Delete")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await saveCategoryAction(null, name);
            if (r.ok) setName("");
            return r;
          });
        }}
      >
        <input className="input h-10 flex-1 text-sm" placeholder={t("New category name")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" type="submit" className="h-10">
          {t("Add")}
        </Button>
      </form>
    </div>
  );
}
