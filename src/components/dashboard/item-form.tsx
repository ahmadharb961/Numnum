"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveItemAction } from "@/actions/menu";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { minorDigits } from "@/lib/money";
import { useT } from "@/i18n/client";

type Item = { id: string; name: string; sku: string; description: string | null; ingredients: string | null; allergens: string | null; dietaryLabels: string[]; priceCents: number; menuCategoryId: string | null; foodCategoryId: string | null; prepTimeMinutes: number | null; available: boolean; groupIds: string[] } | null;

export function ItemForm({ item, currency, categories, foodCategories, groups, created }: { item: Item; currency: string; categories: { id: string; name: string }[]; foodCategories: { id: string; name: string }[]; groups: { id: string; name: string; type: string; optionCount: number }[]; created?: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveItemAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const price = item ? (item.priceCents / 10 ** minorDigits(currency)).toFixed(minorDigits(currency)) : "";
  return (
    <form action={action} className="space-y-4">
      {created && <Alert tone="green">{t("Item created. Add photos below.")}</Alert>}
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" error={fe.name} htmlFor="name">
          <input id="name" name="name" className="input" defaultValue={item?.name} required />
        </Field>
        <Field label="SKU" error={fe.sku} hint="Stable code used for CSV updates and photo matching (e.g. BRG001)" htmlFor="sku">
          <input id="sku" name="sku" className="input font-mono" defaultValue={item?.sku} required />
        </Field>
        <Field label={t("Price ({currency})", { currency })} error={fe.price} htmlFor="price">
          <input id="price" name="price" className="input" inputMode="decimal" defaultValue={price} required />
        </Field>
        <Field label="Preparation time (minutes, optional)" htmlFor="prep">
          <input id="prep" name="prepTimeMinutes" className="input" inputMode="numeric" defaultValue={item?.prepTimeMinutes ?? ""} />
        </Field>
        <Field label="Menu category" htmlFor="cat">
          <select id="cat" name="menuCategoryId" className="input" defaultValue={item?.menuCategoryId ?? ""}>
            <option value="">{t("— None —")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="…or create a new category" htmlFor="newCategory">
          <input id="newCategory" name="newCategory" className="input" placeholder={t("e.g. Burgers")} />
        </Field>
        <Field label="Food category (for discovery)" hint="Helps customers find this dish in Explore" htmlFor="food">
          <select id="food" name="foodCategoryId" className="input" defaultValue={item?.foodCategoryId ?? ""}>
            <option value="">{t("— None —")}</option>
            {foodCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dietary labels (comma separated)" htmlFor="diet">
          <input id="diet" name="dietaryLabels" className="input" defaultValue={item?.dietaryLabels.join(", ")} placeholder={t("Vegan, Gluten-free")} />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <textarea id="description" name="description" className="input" maxLength={1000} defaultValue={item?.description ?? ""} />
      </Field>
      <Field label="Ingredients" hint="Only list what you've confirmed — customers rely on this." htmlFor="ingredients">
        <textarea id="ingredients" name="ingredients" className="input" maxLength={1000} defaultValue={item?.ingredients ?? ""} />
      </Field>
      <Field label="Allergens (optional)" htmlFor="allergens">
        <input id="allergens" name="allergens" className="input" maxLength={300} defaultValue={item?.allergens ?? ""} placeholder={t("Gluten, Dairy, Nuts")} />
      </Field>
      <div>
        <div className="label">{t("Customizations")}</div>
        {groups.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm">
                <input type="checkbox" name="groupIds" value={g.id} defaultChecked={item?.groupIds.includes(g.id)} className="h-5 w-5 accent-brand-500" />
                <span className="flex-1 font-semibold">{g.name}</span>
                <span className="text-xs text-ink-muted">{g.type === "TEXT" ? t("Free text") : t("{n} options", { n: g.optionCount })}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            {t("No customization groups yet.")}{" "}
            <Link href="/dashboard/customizations" className="font-semibold text-brand-600">
              {t("Create one")}
            </Link>
          </p>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="available" defaultChecked={item?.available ?? true} className="h-5 w-5 accent-brand-500" />
        {t("Available for ordering")}
      </label>
      <div className="flex gap-3">
        <Button type="submit" loading={pending} size="lg">
          {item ? t("Save changes") : t("Create item")}
        </Button>
        <Link href="/dashboard/menu" className="inline-flex h-14 items-center px-4 text-sm font-semibold text-ink-muted">
          {t("Cancel")}
        </Link>
      </div>
    </form>
  );
}
