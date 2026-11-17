"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Film, Handshake } from "lucide-react";
import { createCreatorReelAction, startCreatorStreamUploadAction } from "@/actions/creators";
import { uploadFile } from "@/components/dashboard/upload";
import { DishPicker, type PickedDish } from "./dish-picker";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";

/**
 * Posts a creator reel. The video goes through the very same upload as restaurants' reels
 * (resumable, straight to Cloudflare Stream where it's set up), so it plays just as fast.
 */
export function ReelComposer({ stream, dailyLeft }: { stream: boolean; dailyLeft: number }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dish, setDish] = useState<PickedDish | null>(null);
  const [caption, setCaption] = useState("");
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function pickVideo(f: File) {
    setError(null);
    const max = stream ? 500 : 200;
    if (f.size > max * 1024 * 1024) return setError(t("Video is larger than {n} MB", { n: max }));
    setPreview(URL.createObjectURL(f));
    setAssetId(null);
    setProgress(0);
    try {
      if (stream) {
        const s = await startCreatorStreamUploadAction(f.name, f.size);
        if (!s.ok) throw new Error(s.error);
        const tus = await import("tus-js-client");
        await new Promise<void>((resolve, reject) => {
          const up = new tus.Upload(f, {
            endpoint: `/api/reels/tus?scope=creator&assetId=${encodeURIComponent(s.data!)}`,
            chunkSize: 50 * 1024 * 1024,
            retryDelays: [0, 2000, 5000, 10000, 20000],
            metadata: { filename: f.name, filetype: f.type },
            onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
            onSuccess: () => resolve(),
            onError: (err) => reject(new Error(t("Upload failed. Check your connection and try again.") + (err?.message ? ` (${err.message.slice(0, 80)})` : ""))),
          });
          up.start();
        });
        setAssetId(s.data!);
      } else {
        const r = await uploadFile(f, "video", { params: { scope: "creator" }, onProgress: setProgress, retries: 3 });
        setAssetId(r.id);
      }
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  const post = () => {
    setError(null);
    setFieldErr({});
    if (!assetId) return setError(t("Wait for the video upload to finish"));
    if (!dish) return setFieldErr({ menuItemId: "Choose the dish in your reel" });
    start(async () => {
      const r = await createCreatorReelAction({ videoAssetId: assetId, menuItemId: dish.id, caption, paidPartnership: paid });
      if (!r.ok) {
        setError(r.error);
        setFieldErr(r.fieldErrors ?? {});
        return;
      }
      toast(t(r.message ?? "Posted"), "success");
      router.push("/creator");
      router.refresh();
    });
  };

  if (dailyLeft <= 0) return <Alert tone="amber">{t("You've posted the most reels for today. Come back tomorrow.")}</Alert>;
  const uploaded = !!assetId;
  return (
    <div className="space-y-5" data-testid="reel-composer">
      {error && <Alert tone="red">{error}</Alert>}
      <div className="card p-4">
        <div className="mb-2 text-sm font-bold">{t("1. Your video")}</div>
        {preview ? (
          <div className="flex items-center gap-4">
            <video src={preview} className="h-40 w-[90px] shrink-0 rounded-xl bg-black object-cover" muted playsInline autoPlay loop />
            <div className="min-w-0 flex-1">
              {uploaded ? (
                <div className="flex items-center gap-2 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" /> {t("Uploaded")}
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold">{t("Uploading… {n}%", { n: progress ?? 0 })}</div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress ?? 0}%` }} />
                  </div>
                </>
              )}
              <button type="button" onClick={() => input.current?.click()} className="mt-3 text-sm font-semibold text-brand-600">
                {t("Choose another video")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 p-8 text-center hover:bg-brand-50/50" data-testid="pick-video">
            <Film className="h-8 w-8 text-brand-500" />
            <span className="font-bold">{t("Choose a vertical video")}</span>
            <span className="text-xs text-ink-muted">{t("9:16, up to 3 minutes. 15 to 60 seconds works best.")}</span>
          </button>
        )}
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={(e) => e.target.files?.[0] && pickVideo(e.target.files[0])} data-testid="video-input" />
      </div>
      <div className="card p-4">
        <div className="mb-2 text-sm font-bold">{t("2. Tag the dish")}</div>
        <DishPicker value={dish} onChange={setDish} error={fieldErr.menuItemId} />
        <p className="mt-2 text-xs text-ink-muted">{t("The restaurant is asked to approve the tag. Your reel goes live once they accept.")}</p>
      </div>
      <div className="card space-y-4 p-4">
        <div className="text-sm font-bold">{t("3. Details")}</div>
        <Field label="Caption" htmlFor="caption" error={fieldErr.caption}>
          <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} rows={3} placeholder={t("What makes it good?")} className="input" />
        </Field>
        <label className="flex items-start gap-3 rounded-xl bg-cream p-3">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-500" data-testid="paid-partnership" />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-bold">
              <Handshake className="h-4 w-4" /> {t("Paid partnership")}
            </span>
            <span className="text-ink-muted">{t("Tick this if the restaurant paid you or gave you the food. Viewers see “Paid partnership” on the reel.")}</span>
          </span>
        </label>
      </div>
      <Button size="lg" block onClick={post} loading={pending} disabled={!uploaded} data-testid="post-reel">
        {t("Post and send the tag")}
      </Button>
      <p className="text-center text-xs text-ink-muted">{t("{n} more reels today", { n: dailyLeft })}</p>
    </div>
  );
}
