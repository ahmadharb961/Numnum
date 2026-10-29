// Money helpers. All amounts are integer minor units.
// USD → cents (2 decimals). LBP → whole pounds (0 decimals).

export const SUPPORTED_CURRENCIES = ["USD", "LBP"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(c: string): c is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

export function minorDigits(currency: string): number {
  return currency === "LBP" ? 0 : 2;
}

/** Parse a user/CSV supplied decimal string ("7.5", "7,50", "$7.50", "450,000") into minor units. */
export function parseAmount(input: string | number, currency: string = "USD"): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 10 ** minorDigits(currency));
  }
  let s = String(input).trim().replace(/[$\s]|USD|LBP|L\.L\.|LL/gi, "");
  if (!s) return null;
  if (currency === "LBP") {
    s = s.replace(/[,.](?=\d{3}(\D|$))/g, ""); // thousands separators
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const digits = minorDigits(currency);
  const [whole, frac = ""] = s.replace("-", "").split(".");
  if (frac.length > digits && /[1-9]/.test(frac.slice(digits))) return null; // more precision than currency allows
  const minor = Number(whole) * 10 ** digits + Number((frac + "00").slice(0, digits) || "0");
  return s.startsWith("-") ? -minor : minor;
}

export function formatMoney(minor: number, currency: string = "USD"): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  if (currency === "LBP") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} LBP`;
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))}`;
}

/** Round half away from zero for integer division results. */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * Commission in minor units: base × rateBps / 10000, rounded half-up to the cent.
 * Uses integer arithmetic to avoid floating point drift.
 */
export function calcCommission(baseMinor: number, rateBps: number): number {
  if (!Number.isInteger(baseMinor) || !Number.isInteger(rateBps)) throw new Error("integer inputs required");
  const product = baseMinor * rateBps; // safe: base < 1e9, bps ≤ 1e4
  const q = Math.trunc(product / 10000);
  const r = Math.abs(product % 10000);
  return r >= 5000 ? q + Math.sign(product) : q;
}

/** Convert a minor-unit amount into USD cents using an explicit LBP-per-USD rate. */
export function toUsdCents(minor: number, currency: string, lbpPerUsd: number | null): number {
  if (currency === "USD") return minor;
  if (currency === "LBP") {
    if (!lbpPerUsd || lbpPerUsd <= 0) throw new Error("An explicit LBP exchange rate is required");
    return roundHalfUp((minor / lbpPerUsd) * 100);
  }
  throw new Error(`Unsupported currency ${currency}`);
}

export function formatRate(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
