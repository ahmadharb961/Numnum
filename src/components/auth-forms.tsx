"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { loginAction, registerCustomerAction, registerRestaurantAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

/**
 * useActionState that remembers what was typed: React resets forms after every action, so
 * without this a failed login or sign-up clears every field. Passwords are not kept.
 */
function useFormAction(serverAction: (prev: FormState, fd: FormData) => Promise<FormState>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    setValues(Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && k !== "password") as [string, string][]));
    return serverAction(prev, fd);
  }, undefined);
  return [state, action, pending, values] as const;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending, v] = useFormAction(loginAction);
  const insecure = useInsecureOrigin();
  const [showPw, setShowPw] = useState(false);
  return (
    <form action={action} className="space-y-4">
      {insecure && (
        <Alert tone="amber">
          This page isn&apos;t secure, so you can&apos;t stay logged in.{" "}
          <a href={insecure} className="font-semibold underline">
            Open the secure (https) page
          </a>
        </Alert>
      )}
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <span className="relative block">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input id="email" name="email" defaultValue={v.email} type="email" autoComplete="email" required placeholder="Enter your email" className="input h-14 rounded-2xl pl-12" />
        </span>
      </Field>
      <Field label="Password" htmlFor="password">
        <span className="relative block">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input id="password" name="password" type={showPw ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" className="input h-14 rounded-2xl pl-12 pr-12" />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-black/5" aria-label={showPw ? "Hide password" : "Show password"}>
            {showPw ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </span>
      </Field>
      <Button type="submit" size="lg" block loading={pending} className="h-14 rounded-2xl text-base">
        Log in <ArrowRight className="h-5 w-5" />
      </Button>
    </form>
  );
}

export function CustomerRegisterForm({ next }: { next?: string }) {
  const [state, action, pending, v] = useFormAction(registerCustomerAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Name" error={fe.name} htmlFor="name">
        <input id="name" name="name" defaultValue={v.name} autoComplete="name" required className="input" />
      </Field>
      <Field label="Email" error={fe.email} htmlFor="email">
        <input id="email" name="email" defaultValue={v.email} type="email" autoComplete="email" required className="input" />
      </Field>
      <Field label="Phone" error={fe.phone} hint="The restaurant and driver use it to reach you about your orders." htmlFor="phone">
        <input id="phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" placeholder="70 123 456" className="input" required />
      </Field>
      <Field label="Password" error={fe.password} hint="At least 8 characters" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Create account
      </Button>
    </form>
  );
}

export function RestaurantRegisterForm({ loggedInEmail }: { loggedInEmail?: string }) {
  const [state, action, pending, v] = useFormAction(registerRestaurantAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name (shown to customers)" error={fe.displayName} htmlFor="displayName">
          <input id="displayName" name="displayName" defaultValue={v.displayName} required className="input" placeholder="Burger House" />
        </Field>
        <Field label="Legal business name" error={fe.businessName} htmlFor="businessName">
          <input id="businessName" name="businessName" defaultValue={v.businessName} required className="input" placeholder="Burger House SARL" />
        </Field>
        <Field label="Cuisine" error={fe.cuisine} htmlFor="cuisine">
          <input id="cuisine" name="cuisine" defaultValue={v.cuisine} className="input" placeholder="Burgers, American" />
        </Field>
        <Field label="Area" error={fe.area} htmlFor="area">
          <input id="area" name="area" defaultValue={v.area} className="input" placeholder="Hamra, Beirut" />
        </Field>
        <Field label="Restaurant phone" error={fe.phone} hint="Customers and numnum call this number about orders. You can change it later." htmlFor="phone">
          <input id="phone" name="phone" defaultValue={v.phone} type="tel" required className="input" placeholder="70 123 456" />
        </Field>
        <Field label="Your name" error={fe.ownerName} htmlFor="ownerName">
          <input id="ownerName" name="ownerName" defaultValue={v.ownerName} autoComplete="name" required className="input" />
        </Field>
        <Field label="Email" error={fe.email} htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={loggedInEmail ?? v.email} readOnly={!!loggedInEmail} />
        </Field>
        <Field label="Password" error={fe.password} hint={loggedInEmail ? "Your current account password" : "At least 8 characters"} htmlFor="password">
          <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
        </Field>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" className="mt-0.5 h-5 w-5 accent-brand-500" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-semibold text-brand-600 underline" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 underline" target="_blank">
            Privacy Policy
          </Link>
          . I&apos;ll review the commission agreement before enabling online ordering.
        </span>
      </label>
      {fe.terms && <p className="text-xs font-medium text-red-600">{fe.terms}</p>}
      <Button type="submit" size="lg" block loading={pending}>
        Create restaurant account
      </Button>
    </form>
  );
}

/** Login cookies are https-only in production; on plain http, return the https URL to switch to. */
function useInsecureOrigin() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const { protocol, hostname, href } = window.location;
    if (protocol === "http:" && hostname !== "localhost" && hostname !== "127.0.0.1") setUrl(href.replace(/^http:/, "https:"));
  }, []);
  return url;
}
