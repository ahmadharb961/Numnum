"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createTaskAction } from "./actions";
import { CharCounter, Field, inputClass, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { DESCRIPTION_MAX, HEADLINE_MAX } from "@/lib/limits";
import { durationLabel } from "@/lib/format";

const WA_KEY = "yallaok:whatsapp";
const LOC_KEY = "yallaok:location";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (+c / 4)))).toString(16),
  );
}

export function PostForm({ durations, submitLabel }: { durations: number[]; submitLabel: string }) {
  const [state, action, pending] = useActionState(createTaskAction, null);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [token] = useState(uuid);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const waRef = useRef<HTMLInputElement>(null);
  const locRef = useRef<HTMLInputElement>(null);
  const defaultDuration = durations.includes(180) ? 180 : durations[Math.min(1, durations.length - 1)];

  // Remember the WhatsApp number and area for next time (this device only).
  useEffect(() => {
    try {
      if (waRef.current && !waRef.current.value) waRef.current.value = localStorage.getItem(WA_KEY) ?? "";
      if (locRef.current && !locRef.current.value) locRef.current.value = localStorage.getItem(LOC_KEY) ?? "";
    } catch {}
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return (
    <form
      method="post"
      encType="multipart/form-data"
      className="space-y-6"
      onSubmit={(e) => {
        // Submitted by hand (not <form action>) so the fields keep their values if there's an error.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        try {
          if (waRef.current?.value) localStorage.setItem(WA_KEY, waRef.current.value);
          if (locRef.current?.value) localStorage.setItem(LOC_KEY, locRef.current.value);
        } catch {}
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="client_token" value={token} />

      <Field label="Headline" htmlFor="headline" counter={<CharCounter value={headline.length} max={HEADLINE_MAX} />}>
        <input
          id="headline"
          name="headline"
          required
          minLength={3}
          maxLength={HEADLINE_MAX}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Assemble IKEA desk"
          className={inputClass}
          autoComplete="off"
          enterKeyHint="next"
        />
      </Field>

      <Field
        label="Short description"
        htmlFor="description"
        counter={<CharCounter value={description.length} max={DESCRIPTION_MAX} />}
      >
        <textarea
          id="description"
          name="description"
          required
          maxLength={DESCRIPTION_MAX}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One desk, all parts ready. Tools at home."
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Payment offered" htmlFor="reward" hint="What you’ll pay the person who does it.">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-brand-500">$</span>
            <input
              id="reward"
              name="reward"
              required
              inputMode="decimal"
              pattern="^\$?\s*\d+([.,]\d{1,2})?$"
              placeholder="20"
              className={`${inputClass} pl-9 text-lg font-bold text-brand-600`}
              autoComplete="off"
            />
          </div>
        </Field>

        <Field label="Location" htmlFor="location" hint="City or neighbourhood.">
          <input
            id="location"
            name="location"
            ref={locRef}
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. Hamra"
            className={inputClass}
            autoComplete="address-level2"
          />
        </Field>
      </div>

      <Field label="WhatsApp number" htmlFor="whatsapp" hint="With country code. Shown only to people who tap “Contact on WhatsApp”.">
        <input
          id="whatsapp"
          name="whatsapp"
          ref={waRef}
          required
          type="tel"
          inputMode="tel"
          placeholder="+961 70 123 456"
          className={inputClass}
          autoComplete="tel"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Deadline</legend>
        <div className="grid grid-cols-3 gap-2">
          {durations.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center justify-center rounded-2xl bg-lavender px-2 py-3 text-sm font-semibold text-ink-soft transition hover:bg-brand-50 has-[:checked]:bg-brand-500 has-[:checked]:text-white has-[:checked]:shadow-fab has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2"
            >
              <input type="radio" name="duration" value={d} defaultChecked={d === defaultDuration} className="sr-only" required />
              {durationLabel(d)}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">The task disappears automatically when time runs out.</p>
      </fieldset>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-ink">
          Photo <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        {preview ? (
          <div className="relative overflow-hidden rounded-3xl bg-lavender">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected photo" className="aspect-[16/9] w-full object-cover" />
            <button
              type="button"
              onClick={() => {
                if (fileRef.current) fileRef.current.value = "";
                setPreview(null);
              }}
              className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-card hover:bg-white"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="image"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-200 bg-lavender/60 px-4 py-6 text-sm font-semibold text-brand-600 transition hover:border-brand-400 hover:bg-brand-50"
          >
            <ImagePlus className="h-5 w-5" aria-hidden /> Add a photo
          </label>
        )}
        <input
          ref={fileRef}
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setImageError(null);
            if (!f) return setPreview(null);
            if (f.size > 8 * 1024 * 1024) {
              e.target.value = "";
              setImageError("Images must be under 8 MB.");
              return;
            }
            setPreview(URL.createObjectURL(f));
          }}
        />
        {imageError && <p className="text-sm text-coral">{imageError}</p>}
      </div>

      {!pending && state?.error && (
        <p className="rounded-2xl bg-coral-soft px-4 py-3 text-sm font-medium text-coral" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton pending={pending} className={`${buttonClass.primary} w-full py-4 text-lg`} pendingText="Publishing…">
        {submitLabel}
      </SubmitButton>
      <p className="text-center text-xs text-ink-muted">
        No illegal, dangerous or misleading tasks. Listings that break the rules are removed.
      </p>
    </form>
  );
}
