"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Camera, UserRound } from "lucide-react";
import { applyCreatorAction, checkHandleAction, updateCreatorProfileAction } from "@/actions/creators";
import { uploadFile } from "@/components/dashboard/upload";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { AvatarCropper } from "@/components/avatar-cropper";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";

export type CreatorProfileValues = { handle: string; displayName: string; bio: string; instagram: string; tiktok: string; audienceSize: string; area: string; avatarUrl: string | null };

/** Apply to become a creator (mode "apply"), or edit the profile once approved (mode "edit"). */
export function CreatorProfileForm({ mode, initial, handleLockedUntil = null }: { mode: "apply" | "edit"; initial: CreatorProfileValues; handleLockedUntil?: string | null }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [avatar, setAvatar] = useState<{ id: string | null; url: string | null }>({ id: null, url: initial.avatarUrl });
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null); // a photo being placed in its circle
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof CreatorProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function pickAvatar(f: File) {
    setUploading(true);
    try {
      const r = await uploadFile(f, "image", { params: { scope: "creator" } });
      setAvatar({ id: r.id, url: r.thumbUrl ?? r.url ?? null });
      setCropping(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    start(async () => {
      const input = { ...v, audienceSize: v.audienceSize.trim() ? v.audienceSize.replace(/[^\d]/g, "") : null, avatarAssetId: avatar.id };
      const r = mode === "apply" ? await applyCreatorAction(input) : await updateCreatorProfileAction(input);
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      toast(t(r.message ?? "Saved"), "success");
      router.push("/creator");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="creator-form">
      {error && <Alert tone="red">{error}</Alert>}
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500 ring-2 ring-white shadow active:scale-95" aria-label={t("Profile photo")}>
          {avatar.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-9 w-9" />
          )}
          <span className="absolute bottom-0 end-0 grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-white ring-2 ring-white">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="text-sm text-ink-muted">{uploading ? t("Uploading…") : t("Add a clear photo of you: it shows on your profile and reels.")}</div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          data-testid="avatar-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // choosing the same photo again opens it again
            if (f) setCropping(f);
          }}
        />
        <Sheet open={!!cropping} onClose={() => !uploading && setCropping(null)} title="Place your photo">
          {cropping && <AvatarCropper file={cropping} busy={uploading} onCancel={() => setCropping(null)} onDone={(photo) => void pickAvatar(photo)} />}
        </Sheet>
      </div>
      {mode === "apply" || !handleLockedUntil ? (
        <Field label="Username" error={errors.handle} htmlFor="handle" hint={mode === "edit" ? "You can change it once every 3 months. Your old username keeps leading to your profile for 3 months." : undefined}>
          <span className="relative block">
            <AtSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input id="handle" value={v.handle} onChange={(e) => setV((x) => ({ ...x, handle: e.target.value.replace(/\s+/g, "").toLowerCase() }))} required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="rana.eats" className="input ps-9" dir="ltr" maxLength={25} />
          </span>
          <HandleStatus handle={v.handle} />
        </Field>
      ) : (
        <div className="text-sm" data-testid="handle-locked">
          <span className="text-ink-muted">{t("Username")}: </span>
          <b dir="ltr">@{v.handle}</b>
          <p className="mt-1 text-xs text-ink-muted">{t("You can change your username again on {date}.", { date: handleLockedUntil })}</p>
        </div>
      )}
      <Field label="Name shown on your profile" error={errors.displayName} htmlFor="displayName">
        <input id="displayName" value={v.displayName} onChange={set("displayName")} required className="input" />
      </Field>
      <Field label="Bio" error={errors.bio} hint="What you eat, where, your style (up to 300 characters)." htmlFor="bio">
        <textarea id="bio" value={v.bio} onChange={set("bio")} maxLength={300} rows={3} className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instagram" error={errors.instagram} htmlFor="instagram">
          <input id="instagram" value={v.instagram} onChange={set("instagram")} placeholder="@rana.eats" className="input" dir="ltr" autoCapitalize="none" />
        </Field>
        <Field label="TikTok" error={errors.tiktok} htmlFor="tiktok">
          <input id="tiktok" value={v.tiktok} onChange={set("tiktok")} placeholder="@rana.eats" className="input" dir="ltr" autoCapitalize="none" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Followers on other platforms" error={errors.audienceSize} htmlFor="audienceSize">
          <input id="audienceSize" value={v.audienceSize} onChange={set("audienceSize")} inputMode="numeric" placeholder="12000" className="input" dir="ltr" />
        </Field>
        <Field label="Area" error={errors.area} htmlFor="area">
          <input id="area" value={v.area} onChange={set("area")} placeholder="Beirut" className="input" />
        </Field>
      </div>
      <Button type="submit" size="lg" block loading={pending} disabled={uploading}>
        {t(mode === "apply" ? "Send my application" : "Save profile")}
      </Button>
      {mode === "apply" && <p className="text-center text-xs text-ink-muted">{t("We review every application, usually within a day. You'll get an email once you're approved.")}</p>}
    </form>
  );
}

/** As they type: the profile address, and whether the username is free (checked after a short pause). */
function HandleStatus({ handle }: { handle: string }) {
  const t = useT();
  const [state, setState] = useState<{ for: string; available: boolean; current?: boolean; error?: string } | null>(null);
  const clean = handle.trim().replace(/^@/, "");
  useEffect(() => {
    if (clean.length < 3) return setState(null);
    let live = true;
    const timer = setTimeout(async () => {
      const r = await checkHandleAction(clean).catch(() => null);
      if (live && r) setState({ for: clean, available: r.available, current: r.current, error: r.error });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clean]);
  const current = state?.for === clean ? state : null;
  return (
    <p className="mt-1 text-xs" data-testid="handle-status" aria-live="polite">
      <span className="text-ink-muted" dir="ltr">
        numnum.me/c/{clean || "username"}
      </span>
      {current &&
        (current.available ? (
          <span className="ms-2 font-semibold text-emerald-700">✓ {t(current.current ? "Your current username" : "Available")}</span>
        ) : (
          <span className="ms-2 font-semibold text-red-600">{t(current.error ?? "This username is taken")}</span>
        ))}
    </p>
  );
}
