"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { itemReviewAction, restaurantReviewAction } from "@/actions/reviews";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

function StarInput({ name, label, required, size = 36 }: { name: string; label: string; required?: boolean; size?: number }) {
  const [v, setV] = useState(0);
  return (
    <div>
      <div className="label">
        {label}
        {!required && <span className="font-normal text-ink-muted"> (optional)</span>}
      </div>
      <input type="hidden" name={name} value={v || ""} />
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={v === i} aria-label={`${i} star`} onClick={() => setV(i)} className="p-0.5">
            <Star style={{ width: size, height: size }} className={cn(i <= v ? "fill-amber-400 text-amber-400" : "text-black/15")} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Done({ href, message }: { href: string; message?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-5xl">🙏</div>
      <h2 className="mt-3 text-xl font-bold">{message}</h2>
      <Link href={href} className="mt-4 inline-block font-semibold text-brand-600">
        Back
      </Link>
    </div>
  );
}

export function ItemReviewForm({ menuItemId, backHref, hasPhone }: { menuItemId: string; backHref: string; hasPhone: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(itemReviewAction, undefined);
  if (state?.ok) return <Done href={backHref} message={state.message} />;
  return (
    <form action={action} className="space-y-5">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <StarInput name="rating" label="Your rating" required />
      <Field label="Your review (optional)" htmlFor="body">
        <textarea id="body" name="body" className="input" maxLength={1500} placeholder="What did you love? Portion, taste, packaging…" />
      </Field>
      <OrderRefField hasPhone={hasPhone} />
      <Button type="submit" size="lg" block loading={pending}>
        Post review
      </Button>
    </form>
  );
}

export function RestaurantReviewForm({ restaurantId, backHref, hasPhone }: { restaurantId: string; backHref: string; hasPhone: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(restaurantReviewAction, undefined);
  if (state?.ok) return <Done href={backHref} message={state.message} />;
  return (
    <form action={action} className="space-y-5">
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <StarInput name="rating" label="Overall experience" required />
      <div className="grid grid-cols-2 gap-4">
        <StarInput name="foodQuality" label="Food quality" size={24} />
        <StarInput name="service" label="Service" size={24} />
        <StarInput name="value" label="Value" size={24} />
        <StarInput name="delivery" label="Delivery" size={24} />
      </div>
      <Field label="Your review (optional)" htmlFor="body">
        <textarea id="body" name="body" className="input" maxLength={1500} />
      </Field>
      <OrderRefField hasPhone={hasPhone} />
      <Button type="submit" size="lg" block loading={pending}>
        Post review
      </Button>
    </form>
  );
}

function OrderRefField({ hasPhone }: { hasPhone: boolean }) {
  return (
    <Field
      label="Order reference (optional)"
      htmlFor="orderReference"
      hint={hasPhone ? "Link your review to an order you placed. It's marked “Ordered via numnum” only if the restaurant confirmed that order." : "Add your phone number in your account to link reviews to your orders."}
    >
      <input id="orderReference" name="orderReference" className="input uppercase" placeholder="NN-2026-000125" disabled={!hasPhone} />
    </Field>
  );
}
