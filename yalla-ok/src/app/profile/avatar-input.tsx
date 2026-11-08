"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

export function AvatarInput({ current, fallback }: { current: string | null; fallback: string }) {
  const [preview, setPreview] = useState<string | null>(current);
  const [removed, setRemoved] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <label htmlFor="avatar" className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-full bg-brand-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Profile photo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-brand-700">{fallback}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-ink/40 opacity-0 transition group-hover:opacity-100">
          <Camera className="h-6 w-6 text-white" aria-hidden />
        </span>
      </label>
      <div className="space-y-1 text-sm">
        <label htmlFor="avatar" className="cursor-pointer font-semibold text-brand-600">
          {preview ? "Change photo" : "Add a photo"}
        </label>
        <p className="text-xs text-ink-muted">Optional</p>
        {preview && (
          <button
            type="button"
            className="block text-xs font-medium text-ink-muted hover:text-coral"
            onClick={() => {
              setPreview(null);
              setRemoved(true);
              const input = document.getElementById("avatar") as HTMLInputElement | null;
              if (input) input.value = "";
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input type="hidden" name="remove_avatar" value={removed ? "1" : "0"} />
      <input
        id="avatar"
        name="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setPreview(URL.createObjectURL(f));
            setRemoved(false);
          }
        }}
      />
    </div>
  );
}
