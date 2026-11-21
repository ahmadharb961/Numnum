"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Camera, ImagePlus, UserRound } from "lucide-react";
import { applyCreatorAction, checkHandleAction, updateCreatorProfileAction } from "@/actions/creators";
import { uploadFile } from "@/components/dashboard/upload";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { AvatarCropper } from "@/components/avatar-cropper";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";

export type CreatorProfileValues = { handle: string; displayName: string; bio: string; instagram: string; tiktok: string; audienceSize: string; area: string; avatarUrl: string | null; bannerUrl: string | null };

/** Apply to become a creator (mode "apply"), or edit the profile once approved (mode "edit"). */
export function CreatorProfileForm({ mode, initial, handleLockedUntil = null }: { mode: "apply" | "edit"; initial: CreatorProfileValues; handleLockedUntil?: string | null }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [avatar, setAvatar] = useState<{ id: string | null; url: string | null }>({ id: null, url: initial.avatarUrl });
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null); // a photo being placed in its circle
  const [banner, setBanner] = useState<{ id: string | null; url: string | null }>({ id: null, url: initial.bannerUrl });
  const [bannerCrop, setBannerCrop] = useState<File | null>(null); // a banner being placed in its frame
  const bannerFile = useRef<HTMLInputElement>(null);
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

  async function pickBanner(f: File) {
    setUploading(true);
    try {
      const r = await uploadFile(f, "image", { params: { scope: "creator" } });
      setBanner({ id: r.id, url: r.url ?? r.thumbUrl ?? null });
      setBannerCrop(null);
      setErrors((x) => ({ ...x, banner: "" }));
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
    // Both pictures are required: said right away, before anything is sent.
    const missing: Record<string, string> = {};
    if (!banner.url) missing.banner = t("Add a banner for the top of your profile");
    if (!avatar.url) missing.avatar = t("Add your profile photo");
    if (Object.keys(missing).length) {
      setErrors(missing);
      document.getElementById("creator-pictures")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    start(async () => {
      const input = { ...v, audienceSize: v.audienceSize.trim() ? v.audienceSize.replace(/[^\d]/g, "") : null, avatarAssetId: avatar.id, bannerAssetId: banner.id };
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
      {/* Banner (2:1) with the profile photo on it, as on the profile. Both are required. */}
      <div id="creator-pictures" className="pb-2">
        <button
          type="button"
          onClick={() => bannerFile.current?.click()}
          className={`relative block aspect-[2/1] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 active:scale-[0.99] ${errors.banner ? "ring-2 ring-red-500" : ""}`}
          aria-label={t("Banner")}
          data-testid="banner-button"
        >
          {banner.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.url} alt="" className="h-full w-full object-cover" data-testid="banner-preview" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-brand-700">
              <ImagePlus className="h-8 w-8" />
              <span className="text-sm font-bold">{t("Add a banner")}</span>
            </span>
          )}
          {banner.url && (
            <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
              <Camera className="h-3.5 w-3.5" /> {t("Change")}
            </span>
          )}
        </button>
        <div className="-mt-12 flex flex-col items-center">
          <button type="button" onClick={() => file.current?.click()} className={`relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500 shadow-md ring-4 active:scale-95 ${errors.avatar ? "ring-red-500" : "ring-white"}`} aria-label={t("Profile photo")} data-testid="avatar-button">
            {avatar.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-10 w-10" />
            )}
            <span className="absolute bottom-0.5 end-0.5 grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-white ring-2 ring-white">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <p className="mt-2 text-center text-sm text-ink-muted">{uploading ? t("Uploading…") : t("Your banner and a clear photo of you are required: they show on your profile and reels.")}</p>
          {(errors.banner || errors.avatar) && <p className="mt-1 text-center text-sm font-semibold text-red-600" data-testid="pictures-error">{errors.banner || errors.avatar}</p>}
        </div>
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
        <input
          ref={bannerFile}
          type="file"
          accept="image/*"
          hidden
          data-testid="banner-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setBannerCrop(f);
          }}
        />
        <Sheet open={!!cropping} onClose={() => !uploading && setCropping(null)} title="Place your photo">
          {cropping && (
            <AvatarCropper
              file={cropping}
              busy={uploading}
              onCancel={() => setCropping(null)}
              onDone={(photo) => {
                setErrors((x) => ({ ...x, avatar: "" }));
                void pickAvatar(photo);
              }}
            />
          )}
        </Sheet>
        <Sheet open={!!bannerCrop} onClose={() => !uploading && setBannerCrop(null)} title="Place your banner">
          {bannerCrop && <AvatarCropper file={bannerCrop} busy={uploading} aspect={2} out={1500} round={false} onCancel={() => setBannerCrop(null)} onDone={(photo) => void pickBanner(photo)} />}
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
