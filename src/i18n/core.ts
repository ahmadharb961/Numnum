// Shared (server + browser) translation helpers. Texts are written in English in the code and
// looked up in the Arabic dictionary (src/i18n/ar.ts); anything missing falls back to English.

export type Locale = "en" | "ar";
export const LOCALE_COOKIE = "nn_lang";
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "ar";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

export type Vars = Record<string, string | number | null | undefined>;
export type Dict = Record<string, string>;
/** Translate an English text; `{name}` placeholders are filled from `vars`. */
export type T = (text: string, vars?: Vars) => string;

/**
 * Arabic counts take a different noun form for 2 (dual) and for 3–10 (plural) than for 11+: the
 * dictionary can give those as "<key>|2" and "<key>|3-10" (e.g. "{n} restaurants|3-10": "{n} مطاعم").
 */
function countForm(dict: Dict, text: string, n: unknown) {
  const v = typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n) ? Number(n) : NaN;
  if (v === 2) return dict[`${text}|2`];
  if (v >= 3 && v <= 10) return dict[`${text}|3-10`];
  return undefined;
}

export function format(dict: Dict | null, text: string, vars?: Vars) {
  let s = (dict && ((vars && countForm(dict, text, vars.n)) || dict[text])) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
  return s;
}

/** Plural helper: t(plural(n, "{n} dish", "{n} dishes"), { n }). Arabic forms live in the dictionary under the same keys. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Names stored in both languages (e.g. food categories): the Arabic one in Arabic when there is one. */
export const localName = (locale: Locale | string, name: string, nameAr?: string | null) => (locale === "ar" && nameAr ? nameAr : name);
