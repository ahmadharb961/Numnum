import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { AR } from "./ar";
import { format, isLocale, LOCALE_COOKIE, type Locale, type T } from "./core";

/** The visitor's language: their choice (cookie), else the phone's language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*ar\b/i.test(accept) ? "ar" : "en";
});

export const tFor = (locale: string | null | undefined): T => (text, vars) => format(locale === "ar" ? AR : null, text, vars);

/** Translator for server components and actions: `const t = await getT()`. */
export async function getT(): Promise<T> {
  return tFor(await getLocale());
}

export const dictFor = (l: Locale) => (l === "ar" ? AR : null);
