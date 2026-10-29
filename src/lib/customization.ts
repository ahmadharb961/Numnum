// Customization validation shared by the browser (instant feedback) and the
// server (authoritative re-validation before an order is created).

export type CustomizationOptionDef = {
  id: string;
  name: string;
  priceDeltaCents: number;
  available: boolean;
};

export type CustomizationGroupDef = {
  id: string;
  name: string;
  type: "SINGLE" | "MULTIPLE" | "TEXT";
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: CustomizationOptionDef[];
};

/** groupId → selected option ids (SINGLE/MULTIPLE) or free text (TEXT). */
export type Selections = Record<string, string[] | string>;

export type ChosenOption = { groupId: string; groupName: string; optionId: string | null; optionName: string; priceDeltaCents: number };

export type ValidationResult = {
  ok: boolean;
  errors: Record<string, string>;
  chosen: ChosenOption[];
  unitOptionsCents: number;
};

export const MAX_TEXT_LENGTH = 300;

export function effectiveBounds(g: CustomizationGroupDef): { min: number; max: number } {
  if (g.type === "SINGLE") return { min: g.required ? 1 : 0, max: 1 };
  const max = g.maxSelect > 0 ? g.maxSelect : g.options.length;
  const min = Math.max(g.required ? Math.max(1, g.minSelect) : g.minSelect, 0);
  return { min: Math.min(min, max), max };
}

export function validateSelections(groups: CustomizationGroupDef[], selections: Selections | undefined): ValidationResult {
  const errors: Record<string, string> = {};
  const chosen: ChosenOption[] = [];
  const sel = selections ?? {};
  const knownGroups = new Set(groups.map((g) => g.id));
  for (const key of Object.keys(sel)) {
    if (!knownGroups.has(key)) errors[key] = "Unknown customization";
  }

  for (const g of groups) {
    const value = sel[g.id];
    if (g.type === "TEXT") {
      const text = typeof value === "string" ? value.trim() : "";
      if (g.required && !text) errors[g.id] = `${g.name} is required`;
      else if (text.length > MAX_TEXT_LENGTH) errors[g.id] = `${g.name} must be under ${MAX_TEXT_LENGTH} characters`;
      else if (text) chosen.push({ groupId: g.id, groupName: g.name, optionId: null, optionName: text, priceDeltaCents: 0 });
      continue;
    }
    const ids = Array.isArray(value) ? Array.from(new Set(value)) : typeof value === "string" && value ? [value] : [];
    const { min, max } = effectiveBounds(g);
    const opts: CustomizationOptionDef[] = [];
    let invalid = false;
    for (const id of ids) {
      const o = g.options.find((x) => x.id === id);
      if (!o) {
        invalid = true;
        errors[g.id] = `Invalid choice for ${g.name}`;
      } else if (!o.available) {
        invalid = true;
        errors[g.id] = `${o.name} is currently unavailable`;
      } else opts.push(o);
    }
    if (invalid) continue;
    if (opts.length < min) {
      errors[g.id] = min === 1 ? `Choose ${g.type === "SINGLE" ? "an option" : "at least 1"} for ${g.name}` : `Choose at least ${min} for ${g.name}`;
      continue;
    }
    if (opts.length > max) {
      errors[g.id] = `Choose at most ${max} for ${g.name}`;
      continue;
    }
    for (const o of opts) chosen.push({ groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, priceDeltaCents: o.priceDeltaCents });
  }

  const unitOptionsCents = chosen.reduce((s, c) => s + c.priceDeltaCents, 0);
  return { ok: Object.keys(errors).length === 0, errors, chosen, unitOptionsCents };
}

/** Unit price never drops below zero even with negative adjustments. */
export function unitPrice(baseCents: number, optionsCents: number): number {
  return Math.max(0, baseCents + optionsCents);
}

/** Stable signature used to merge identical cart lines. */
export function selectionSignature(menuItemId: string, selections: Selections, note?: string): string {
  const parts = Object.keys(selections)
    .sort()
    .map((k) => {
      const v = selections[k];
      return `${k}=${Array.isArray(v) ? [...v].sort().join(",") : v}`;
    });
  return `${menuItemId}|${parts.join(";")}|${(note || "").trim()}`;
}
