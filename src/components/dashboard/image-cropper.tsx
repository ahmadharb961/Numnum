"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ASPECTS = [
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "Original", value: 0 },
];

/** Touch-friendly crop: drag to position, slider to zoom. Never distorts the image. */
export function ImageCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const [src, setSrc] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ar = aspect || (img ? img.naturalWidth / img.naturalHeight : 1);

  function geometry() {
    const el = box.current!;
    const bw = el.clientWidth, bh = el.clientHeight;
    const scale = Math.max(bw / img!.naturalWidth, bh / img!.naturalHeight) * zoom; // cover
    const w = img!.naturalWidth * scale, h = img!.naturalHeight * scale;
    const maxX = (w - bw) / 2, maxY = (h - bh) / 2;
    return { bw, bh, scale, w, h, maxX, maxY };
  }

  function clamp(p: { x: number; y: number }) {
    if (!img || !box.current) return p;
    const g = geometry();
    return { x: Math.min(g.maxX, Math.max(-g.maxX, p.x)), y: Math.min(g.maxY, Math.max(-g.maxY, p.y)) };
  }

  useEffect(() => setPos((p) => clamp(p)), [zoom, aspect, img]); // eslint-disable-line react-hooks/exhaustive-deps

  async function done() {
    if (!img || !box.current) return;
    const g = geometry();
    // visible box in source pixels
    const sx = (g.w / 2 - g.bw / 2 - pos.x) / g.scale;
    const sy = (g.h / 2 - g.bh / 2 - pos.y) / g.scale;
    const sw = g.bw / g.scale, sh = g.bh / g.scale;
    const outW = Math.min(1600, Math.round(sw));
    const outH = Math.round(outW / (sw / sh));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    canvas.toBlob((b) => b && onDone(b), "image/jpeg", 0.9);
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex gap-2">
        {ASPECTS.map((a) => (
          <button key={a.label} type="button" onClick={() => setAspect(a.value)} className={cn("chip h-8 text-xs", aspect === a.value && "chip-active")}>
            {a.label}
          </button>
        ))}
      </div>
      <div
        ref={box}
        className="relative w-full touch-none overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: String(ar) }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {src && img && box.current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Crop preview"
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
            style={{ width: geometry().w, height: geometry().h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/20" />
          ))}
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        Zoom
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-brand-500" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={done} disabled={!img}>
          Use photo
        </Button>
      </div>
    </div>
  );
}
