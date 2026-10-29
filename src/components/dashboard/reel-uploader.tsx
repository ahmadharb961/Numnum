"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, ImagePlus, CheckCircle2 } from "lucide-react";
import { createReelAction } from "@/actions/reels";
import { uploadFile } from "./upload";
import { ItemPicker } from "./item-picker";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

export function ReelUploader({ items, defaultItemId, canPublish }: { items: { id: string; label: string; sku: string }[]; defaultItemId?: string; canPublish: boolean }) {
  const router = useRouter();
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [caption, setCaption] = useState("");
  const [poster, setPoster] = useState<{ id: string; url: string } | null>(null);
  const [publish, setPublish] = useState(canPublish);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const vInput = useRef<HTMLInputElement>(null);
  const pInput = useRef<HTMLInputElement>(null);

  async function pickVideo(f: File) {
    setError(null);
    if (f.size > 200 * 1024 * 1024) return setError("Video is larger than 200 MB");
    setVideo(f);
    setPreview(URL.createObjectURL(f));
    setAssetId(null);
    setProgress(0);
    try {
      const res = await uploadFile(f, "video", { onProgress: setProgress, retries: 3 });
      setAssetId(res.id);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  async function pickPoster(f: File) {
    try {
      const res = await uploadFile(f, "image");
      setPoster({ id: res.id, url: res.thumbUrl ?? res.url ?? "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!assetId) return setError("Wait for the video upload to finish");
    if (!itemId) return setError("Choose the menu item shown in this reel");
    setSaving(true);
    const res = await createReelAction({ videoAssetId: assetId, menuItemId: itemId, caption, posterAssetId: poster?.id, publish });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    router.push(`/dashboard/reels/${res.data}`);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div>
        {preview ? (
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl bg-black">
            <video src={preview} className="h-full w-full object-cover" muted playsInline loop autoPlay controls={false} />
            {progress !== null && !assetId && (
              <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 p-3 text-xs font-semibold text-white">
                Uploading… {progress}%
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {assetId && (
              <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white">
                <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => vInput.current?.click()} className="mx-auto flex aspect-[9/16] w-full max-w-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/15 bg-white text-center">
            <Film className="h-10 w-10 text-brand-500" />
            <span className="font-bold">Choose or record a video</span>
            <span className="px-6 text-xs text-ink-muted">MP4, MOV or WebM · vertical works best</span>
          </button>
        )}
        <input ref={vInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickVideo(e.target.files[0])} />
        {video && (
          <button onClick={() => vInput.current?.click()} className="mt-2 w-full text-center text-sm font-semibold text-brand-600">
            Choose a different video
          </button>
        )}
      </div>
      <div className="card space-y-4 p-5">
        {error && <Alert tone="red">{error}</Alert>}
        <div>
          <div className="label">Linked menu item *</div>
          <ItemPicker items={items} value={itemId} onChange={setItemId} />
          <p className="mt-1 text-xs text-ink-muted">The reel always shows this item's current name, price and rating, and opens its order screen.</p>
        </div>
        <Field label="Caption (optional)">
          <textarea className="input" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Smashed to order, every time 🔥" />
        </Field>
        <div>
          <div className="label">Thumbnail (optional)</div>
          <div className="flex items-center gap-3">
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster.url} alt="" className="h-20 w-12 rounded-lg object-cover" />
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => pInput.current?.click()}>
              <ImagePlus className="h-4 w-4" /> {poster ? "Replace" : "Upload custom thumbnail"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">We generate one automatically from the video if you skip this.</p>
          <input ref={pInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickPoster(e.target.files[0])} />
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={publish} disabled={!canPublish} onChange={(e) => setPublish(e.target.checked)} className="h-5 w-5 accent-brand-500" />
          Publish automatically when processing finishes
        </label>
        <Button size="lg" block onClick={save} loading={saving} disabled={!assetId || !itemId}>
          Save reel
        </Button>
      </div>
    </div>
  );
}
