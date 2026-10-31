import type { T, Vars } from "@/i18n/core";

// Notification texts are stored as a translation key + values, so they show in whatever language
// the reader uses when they open them (not the language at the time they were sent).
// Older rows (and admin notifications) hold plain text.
export type Text = string | { k: string; v?: Vars };
const MARK = "§";

export const encodeText = (x: Text): string => (typeof x === "string" ? x : MARK + JSON.stringify(x));

export function showText(t: T, stored: string | null | undefined): string | undefined {
  if (stored == null) return undefined;
  if (stored.startsWith(MARK)) {
    try {
      const x = JSON.parse(stored.slice(MARK.length)) as { k: string; v?: Vars };
      return t(x.k, x.v);
    } catch {
      return stored.slice(MARK.length);
    }
  }
  return t(stored);
}
