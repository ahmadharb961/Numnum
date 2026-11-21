export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Short counts: 950 → "950", 2,048 → "2K", 2,350 → "2.3K", 6,640 → "6.6K", 1,250,000 → "1.2M".
 * Rounded down (never shows more than the real number), one decimal at most.
 */
export function compactNumber(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  const [div, unit] = v >= 1_000_000_000 ? [1_000_000_000, "B"] : v >= 1_000_000 ? [1_000_000, "M"] : [1000, "K"];
  const x = Math.floor((v / div) * 10) / 10;
  return `${x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)}${unit}`;
}

// Arabic dates use Lebanese month names with Western digits ("30 تشرين الأول 2026").
const dateLocale = (lang?: string) => (lang === "ar" ? "ar-LB-u-nu-latn" : "en-GB");

export function formatDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, lang?: string): string {
  return new Intl.DateTimeFormat(dateLocale(lang), { timeZone: "Asia/Beirut", ...opts }).format(new Date(d));
}

export function formatDateTime(d: Date | string, lang?: string): string {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" }, lang);
}

export function periodLabel(period: string, lang?: string): string {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const month = start.toLocaleString(lang === "ar" ? "ar-LB-u-nu-latn" : "en-US", { month: "long", timeZone: "UTC" });
  return lang === "ar" ? `1–${end.getUTCDate()} ${month} ${y}` : `${month} 1–${end.getUTCDate()}, ${y}`;
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousPeriod(d: Date = new Date()): string {
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return periodOf(p);
}

export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** "Hamra, Beirut" from address parts, skipping empty ones and repeats ("Jounieh, Jounieh" → "Jounieh"). */
export function placeLabel(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = p?.trim();
    const key = v?.toLowerCase().replace(/\s+/g, " ");
    if (!v || !key || seen.has(key) || out.some((o) => o.toLowerCase().includes(key))) continue;
    seen.add(key);
    out.push(v);
  }
  return out.join(", ");
}
