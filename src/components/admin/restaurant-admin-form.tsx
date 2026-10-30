"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRestaurantAdminAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function RestaurantAdminForm(p: { id: string; commissionRate: string; restrictReels: boolean; restrictPromotion: boolean; orderingEnabled: boolean }) {
  const [rate, setRate] = useState(p.commissionRate);
  const [reels, setReels] = useState(p.restrictReels);
  const [promo, setPromo] = useState(p.restrictPromotion);
  const [ordering, setOrdering] = useState(p.orderingEnabled);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-4">
      <Field label="Restaurant-specific commission rate (%)" hint="Leave empty to use the platform default. Applies to future order requests only.">
        <input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Default" />
      </Field>
      <div className="space-y-2 text-sm font-semibold">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={ordering} onChange={(e) => setOrdering(e.target.checked)} className="h-5 w-5 accent-brand-500" /> Online ordering enabled
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={reels} onChange={(e) => setReels(e.target.checked)} className="h-5 w-5 accent-brand-500" /> Restrict new reels
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} className="h-5 w-5 accent-brand-500" /> Restrict promoted content
        </label>
      </div>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await updateRestaurantAdminAction(p.id, { commissionRate: rate, restrictReels: reels, restrictPromotion: promo, orderingEnabled: ordering });
            toast(r.ok ? "Saved" : r.error, r.ok ? "success" : "error");
            router.refresh();
          })
        }
      >
        Save controls
      </Button>
    </div>
  );
}
