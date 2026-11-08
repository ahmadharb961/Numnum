"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { forgotPasswordAction, googleSignInAction, signInAction, signUpAction } from "@/app/auth/actions";

function GoogleButton({ next }: { next: string }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton className={`${buttonClass.secondary} w-full bg-white py-3.5 ring-1 ring-ink/10`} pendingText="Opening Google…">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continue with Google
      </SubmitButton>
    </form>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
      <span className="h-px flex-1 bg-ink/10" /> or <span className="h-px flex-1 bg-ink/10" />
    </div>
  );
}

export function SignInForm({ next, google }: { next: string; google: boolean }) {
  const [forgot, setForgot] = useState(false);
  if (forgot) {
    return (
      <div className="space-y-5">
        <ActionForm action={forgotPasswordAction} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
          </Field>
          <SubmitButton className={`${buttonClass.primary} w-full`} pendingText="Sending…">
            Send reset link
          </SubmitButton>
        </ActionForm>
        <button type="button" onClick={() => setForgot(false)} className="w-full text-center text-sm font-semibold text-brand-600">
          Back to sign in
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <ActionForm action={signInAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </Field>
        <SubmitButton className={`${buttonClass.primary} w-full`} pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => setForgot(true)} className="font-medium text-ink-muted hover:text-ink">
          Forgot password?
        </button>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-600">
          Create account
        </Link>
      </div>
    </div>
  );
}

export function SignUpForm({ next, google }: { next: string; google: boolean }) {
  return (
    <div className="space-y-5">
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <ActionForm action={signUpAction} className="space-y-4">
        {(state) =>
          state?.ok === "check-email" ? (
            <div className="rounded-3xl bg-lavender p-6 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-brand-500" aria-hidden />
              <p className="mt-3 font-bold">Check your email</p>
              <p className="mt-1 text-sm text-ink-muted">Tap the link we sent to finish creating your account.</p>
            </div>
          ) : (
            <>
              <input type="hidden" name="next" value={next} />
              <Field label="Your name" htmlFor="display_name" hint="Shown on your tasks.">
                <input id="display_name" name="display_name" required maxLength={40} autoComplete="name" className={inputClass} />
              </Field>
              <Field label="Email" htmlFor="email" hint="Never shown to anyone.">
                <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
              </Field>
              <Field label="Password" htmlFor="password" hint="At least 8 characters.">
                <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </Field>
              <SubmitButton className={`${buttonClass.primary} w-full`} pendingText="Creating account…">
                Create account
              </SubmitButton>
            </>
          )
        }
      </ActionForm>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-600">
          Sign in
        </Link>
      </p>
    </div>
  );
}
