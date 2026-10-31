"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Star, Trash2, Crop } from "lucide-react";
import { cn } from "@/lib/utils";
import { movePhotoAction, removePhotoAction, setMainPhotoAction } from "@/actions/menu";
import { uploadFile } from "./upload";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ImageCropper } from "./image-cropper";
import { useT } from "@/i18n/client";

type Photo = { id: string; url: string; thumbUrl: string | null; isMain: boolean };

export function ItemPhotos({ itemId, photos }: { itemId: string; photos: Photo[] }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, start] = useTransition();

  async function upload(blob: Blob, name: string) {
    setProgress(0);
    try {
      await uploadFile(blob, "image", { params: { attachTo: itemId, ...(replaceId && photos.find((p) => p.id === replaceId)?.isMain ? { main: "1" } : {}) }, onProgress: setProgress, name });
      if (replaceId) await removePhotoAction(replaceId);
      toast("Photo added", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setProgress(null);
      setReplaceId(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setCropFile(f);
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
      router.refresh();
    });

  return (
    <div>
      <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", pending && "opacity-60")}>
        {photos.map((p, i) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumbUrl ?? p.url} alt="" className="h-full w-full object-cover" />
            {p.isMain && <span className="absolute start-1.5 top-1.5 rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{t("Main")}</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent p-1">
              <button type="button" disabled={i === 0} onClick={() => run(() => movePhotoAction(p.id, -1))} className="grid h-8 w-8 place-items-center text-white disabled:opacity-30" aria-label={t("Move left")}>
                <ArrowLeft className="rtl:-scale-x-100 h-4 w-4" />
              </button>
              {!p.isMain && (
                <button type="button" onClick={() => run(() => setMainPhotoAction(p.id))} className="grid h-8 w-8 place-items-center text-white" aria-label={t("Set as main photo")}>
                  <Star className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setReplaceId(p.id);
                  galleryRef.current?.click();
                }}
                className="grid h-8 w-8 place-items-center text-white"
                aria-label={t("Replace photo")}
              >
                <Crop className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => confirm("Remove this photo?") && run(() => removePhotoAction(p.id))} className="grid h-8 w-8 place-items-center text-white" aria-label={t("Remove photo")}>
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" disabled={i === photos.length - 1} onClick={() => run(() => movePhotoAction(p.id, 1))} className="grid h-8 w-8 place-items-center text-white disabled:opacity-30" aria-label={t("Move right")}>
                <ArrowRight className="rtl:-scale-x-100 h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => galleryRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 text-xs font-semibold text-ink-muted">
          <ImagePlus className="h-6 w-6" /> {t("Gallery")}
        </button>
        <button type="button" onClick={() => cameraRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 text-xs font-semibold text-ink-muted">
          <Camera className="h-6 w-6" /> {t("Take photo")}
        </button>
      </div>
      {progress !== null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={onPick} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <Sheet open={!!cropFile} onClose={() => setCropFile(null)} title="Crop photo">
        {cropFile && (
          <ImageCropper
            file={cropFile}
            onCancel={() => setCropFile(null)}
            onDone={(blob) => {
              const name = cropFile.name.replace(/\.\w+$/, ".jpg");
              setCropFile(null);
              void upload(blob, name);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
