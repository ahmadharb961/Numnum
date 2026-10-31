"use client";

import { createContext, Fragment, useContext, useMemo } from "react";
import { format, type Dict, type Locale, type T } from "./core";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "en", t: (s, v) => format(null, s, v) });

/** Given the language and its dictionary by the root layout (Arabic only is sent when needed). */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: ((s, v) => format(dict, s, v)) as T }), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx).t;
export const useLocale = () => useContext(Ctx).locale;

/**
 * A translated sentence with React pieces inside, so word order stays right in Arabic:
 * rich(t, "Tap {share} at the bottom", { share: <b>Share</b> }).
 */
export function rich(t: T, text: string, parts: Record<string, React.ReactNode>): React.ReactNode {
  const out: React.ReactNode[] = [];
  const s = t(text);
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    out.push(s.slice(last, m.index));
    out.push(<Fragment key={m.index}>{m[1] in parts ? parts[m[1]] : m[0]}</Fragment>);
    last = m.index! + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}
