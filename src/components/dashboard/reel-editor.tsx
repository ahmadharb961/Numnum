"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { deleteReelAction, retryReelAction, setReelVisibilityAction, updateReelAction } from "@/actions/reels";
import { uploadFile } from "./upload";
import { ItemPicker } from "./item-picker";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

type Reel = { id: string; status: string; visibility: string; caption: string; videoUrl: string | null; posterUrl: string | null; menuItemId: string; processingError: string | null; removedReason: string | null };

export function ReelEditor({ reel, items }: { reel: Reel; items: { id: string; label: string; sku: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [caption, setCaption] = useState(reel.caption);
  const [itemId, setItemId] = useState(reel.menuItemId);
  const [pending, start] = useTransition();
  const pInput = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
      else if (r.message) toast(r.message, "success");
      router.refresh();
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl bg-black">
        {reel.status === "READY" && reel.videoUrl ? (
          <video src={reel.videoUrl} poster={reel.posterUrl ?? undefined} className="h-full w-full object-cover" controls playsInline />
        ) : reel.status === "PROCESSING" ? (
          <div className="grid h-full place-items-center text-center text-sm text-white/80">
            <div>
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" /> Optimising video for mobile…
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-white/80">Processing failed</div>
        )}
      </div>
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={reel.visibility === "PUBLISHED" ? "green" : reel.visibility === "REMOVED" ? "red" : "gray"}>{reel.visibility.toLowerCase()}</Badge>
          <Badge tone={reel.status === "READY" ? "green" : reel.status === "FAILED" ? "red" : "blue"}>{reel.status.toLowerCase()}</Badge>
        </div>
        {reel.status === "FAILED" && (
          <Alert tone="red">
            {reel.processingError ?? "We couldn't process this video."}{" "}
            <button className="font-semibold underline" onClick={() => run(() => retryReelAction(reel.id))}>
              Retry
            </button>
          </Alert>
        )}
        {reel.visibility === "REMOVED" && <Alert tone="red">Removed by moderation{reel.removedReason ? `: ${reel.removedReason}` : ""}.</Alert>}
        <div>
          <div className="label">Linked menu item</div>
          <ItemPicker items={items} value={itemId} onChange={setItemId} />
        </div>
        <Field label="Caption">
          <textarea className="input" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button loading={pending} onClick={() => run(() => updateReelAction(reel.id, { caption, menuItemId: itemId }))}>
            Save changes
          </Button>
          <Button variant="outline" onClick={() => pInput.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Replace thumbnail
          </Button>
          <input
            ref={pInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const up = await uploadFile(f, "image");
                run(() => updateReelAction(reel.id, { posterAssetId: up.id }));
              } catch (err) {
                toast((err as Error).message, "error");
              }
            }}
          />
        </div>
        <hr className="border-black/5" />
        <div className="flex flex-wrap gap-2">
          {reel.visibility === "PUBLISHED" ? (
            <Button variant="outline" onClick={() => run(() => setReelVisibilityAction(reel.id, false))}>
              Unpublish
            </Button>
          ) : (
            reel.visibility !== "REMOVED" && (
              <Button variant="dark" disabled={reel.status !== "READY"} onClick={() => run(() => setReelVisibilityAction(reel.id, true))}>
                Publish
              </Button>
            )
          )}
          {reel.visibility === "PUBLISHED" && (
            <a href={`/reel/${reel.id}`} target="_blank" className="inline-flex h-11 items-center px-3 text-sm font-semibold text-brand-600">
              View live
            </a>
          )}
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={() => {
              if (!confirm("Delete this reel permanently?")) return;
              start(async () => {
                const r = await deleteReelAction(reel.id);
                if (r.ok) router.push("/dashboard/reels");
                else toast(r.error, "error");
              });
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
