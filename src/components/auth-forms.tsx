"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerCustomerAction, registerRestaurantAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Log in
      </Button>
    </form>
  );
}

export function CustomerRegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerCustomerAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Name" error={fe.name} htmlFor="name">
        <input id="name" name="name" autoComplete="name" required className="input" />
      </Field>
      <Field label="Email" error={fe.email} htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </Field>
      <Field label="Phone (optional)" error={fe.phone} hint="Used only to link your reviews to orders you placed." htmlFor="phone">
        <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="70 123 456" className="input" />
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
  const [state, action, pending] = useActionState<FormState, FormData>(registerRestaurantAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name (shown to customers)" error={fe.displayName} htmlFor="displayName">
          <input id="displayName" name="displayName" required className="input" placeholder="Burger House" />
        </Field>
        <Field label="Legal business name" error={fe.businessName} htmlFor="businessName">
          <input id="businessName" name="businessName" required className="input" placeholder="Burger House SARL" />
        </Field>
        <Field label="Cuisine" error={fe.cuisine} htmlFor="cuisine">
          <input id="cuisine" name="cuisine" className="input" placeholder="Burgers, American" />
        </Field>
        <Field label="Area" error={fe.area} htmlFor="area">
          <input id="area" name="area" className="input" placeholder="Hamra, Beirut" />
        </Field>
        <Field label="Restaurant phone" error={fe.phone} hint="Customers and numnum call this number about orders. You can change it later." htmlFor="phone">
          <input id="phone" name="phone" type="tel" required className="input" placeholder="70 123 456" />
        </Field>
        <Field label="Your name" error={fe.ownerName} htmlFor="ownerName">
          <input id="ownerName" name="ownerName" autoComplete="name" required className="input" />
        </Field>
        <Field label="Email" error={fe.email} htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={loggedInEmail} readOnly={!!loggedInEmail} />
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
