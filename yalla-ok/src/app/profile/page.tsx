import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { publicStorageUrl } from "@/lib/env";
import { initials } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { AvatarInput } from "./avatar-input";
import { changePasswordAction, updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { user, profile } = await requireUser("/profile");
  const sp = await searchParams;
  const avatar = publicStorageUrl("avatars", profile.avatar_url);
  const usesPassword = user.app_metadata?.providers?.includes?.("email") ?? user.app_metadata?.provider === "email";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageTitle>Profile</PageTitle>

      {profile.status !== "active" && (
        <Notice tone="error" title={`Account ${profile.status}`}>
          You can browse, but you can’t post new tasks.
        </Notice>
      )}

      <section className="rounded-4xl bg-white p-6 shadow-card ring-1 ring-ink/5">
        <ActionForm action={updateProfileAction} className="space-y-5">
          <AvatarInput current={avatar} fallback={initials(profile.display_name)} />
          <Field label="Display name" htmlFor="display_name" hint="Shown on your tasks.">
            <input id="display_name" name="display_name" defaultValue={profile.display_name} required maxLength={40} className={inputClass} />
          </Field>
          <div className="space-y-2">
            <span className="text-sm font-semibold">Email</span>
            <p className="rounded-2xl bg-lavender px-4 py-3.5 text-ink-soft">{user.email}</p>
            <p className="text-xs text-ink-muted">Private. Never shown on your tasks.</p>
          </div>
          <SubmitButton className={buttonClass.primary} pendingText="Saving…">
            Save profile
          </SubmitButton>
        </ActionForm>
      </section>

      {(usesPassword || sp.reset) && (
        <section className="rounded-4xl bg-white p-6 shadow-card ring-1 ring-ink/5">
          <h2 className="mb-4 font-bold">{sp.reset ? "Choose a new password" : "Change password"}</h2>
          <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
            <Field label="New password" htmlFor="password" hint="At least 8 characters.">
              <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className={inputClass} />
            </Field>
            <SubmitButton className={buttonClass.secondary} pendingText="Updating…">
              Update password
            </SubmitButton>
          </ActionForm>
        </section>
      )}

      <form action="/auth/signout" method="post">
        <button type="submit" className={`${buttonClass.ghost} w-full`}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );
}
