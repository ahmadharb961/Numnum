"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteFoodCategoryAction, mergeFoodCategoryAction, saveFoodCategoryAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { uploadFile } from "@/components/dashboard/upload";

type Cat = { id: string; name: string; nameAr: string; emoji: string; imageUrl: string; sortOrder: number; active: boolean; slug: string; count: number };

export function CategoryAdmin({ categories }: { categories: Cat[] }) {
  const [rows, setRows] = useState(categories);
  const [nw, setNw] = useState({ name: "", nameAr: "", emoji: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? r.message ?? "Saved" : r.error ?? "Failed", r.ok ? "success" : "error");
      router.refresh();
    });
  const upd = (id: string, patch: Partial<Cat>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  // A new photo is saved straight away so the Restaurants page shows it.
  const onFile = async (file: File) => {
    const c = rows.find((r) => r.id === uploadFor);
    if (!c) return;
    try {
      const up = await uploadFile(file, "image", { params: { scope: "platform" } });
      upd(c.id, { imageUrl: up.url ?? "" });
      run(() => saveFoodCategoryAction({ ...c, imageUrl: up.url ?? "" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploadFor(null);
    }
  };
  return (
    <div className="card overflow-x-auto p-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
          else setUploadFor(null);
        }}
      />
      <table className="table-app">
        <thead>
          <tr>
            <th>Image</th>
            <th>Emoji</th>
            <th>Name</th>
            <th>Arabic</th>
            <th>Order</th>
            <th>Active</th>
            <th>Items</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <button
                  type="button"
                  title="Upload a square photo (white or transparent background looks best)"
                  onClick={() => {
                    setUploadFor(c.id);
                    fileRef.current?.click();
                  }}
                  className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white shadow ring-1 ring-black/5"
                >
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-ink-muted" />
                  )}
                  {uploadFor === c.id && <span className="absolute inset-0 animate-pulse bg-white/70" />}
                </button>
              </td>
              <td>
                <input className="input h-9 w-14 text-center" value={c.emoji} onChange={(e) => upd(c.id, { emoji: e.target.value })} />
              </td>
              <td>
                <input className="input h-9 w-40 text-sm" value={c.name} onChange={(e) => upd(c.id, { name: e.target.value })} />
                <div className="text-[11px] text-ink-muted">/{c.slug}</div>
              </td>
              <td>
                <input className="input h-9 w-32 text-sm" dir="rtl" value={c.nameAr} onChange={(e) => upd(c.id, { nameAr: e.target.value })} />
              </td>
              <td>
                <input className="input h-9 w-16 text-sm" type="number" value={c.sortOrder} onChange={(e) => upd(c.id, { sortOrder: Number(e.target.value) })} />
              </td>
              <td>
                <input type="checkbox" checked={c.active} onChange={(e) => upd(c.id, { active: e.target.checked })} className="h-5 w-5 accent-brand-500" />
              </td>
              <td>{c.count}</td>
              <td className="whitespace-nowrap">
                <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => saveFoodCategoryAction(c))}>
                  Save
                </Button>
                <select
                  className="input ml-2 inline-block h-9 w-auto text-xs"
                  value=""
                  onChange={(e) => e.target.value && confirm(`Merge “${c.name}” into “${rows.find((r) => r.id === e.target.value)?.name}”? Items are moved and this category is deleted.`) && run(() => mergeFoodCategoryAction(c.id, e.target.value))}
                >
                  <option value="">Merge into…</option>
                  {rows
                    .filter((r) => r.id !== c.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => confirm(`Delete “${c.name}”? Items keep existing without this category.`) && run(() => deleteFoodCategoryAction(c.id))}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
          <tr>
            <td />
            <td>
              <input className="input h-9 w-14 text-center" value={nw.emoji} onChange={(e) => setNw({ ...nw, emoji: e.target.value })} placeholder="🍕" />
            </td>
            <td>
              <input className="input h-9 w-40 text-sm" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} placeholder="New category" />
            </td>
            <td>
              <input className="input h-9 w-32 text-sm" dir="rtl" value={nw.nameAr} onChange={(e) => setNw({ ...nw, nameAr: e.target.value })} />
            </td>
            <td colSpan={4}>
              <Button size="sm" onClick={() => run(async () => { const r = await saveFoodCategoryAction({ ...nw, sortOrder: rows.length }); if (r.ok) setNw({ name: "", nameAr: "", emoji: "" }); return r; })}>
                Add category
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
