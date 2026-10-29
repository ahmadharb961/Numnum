// Phone normalization with Lebanese defaults and international support.
// Output: digits only, E.164 without "+", e.g. "96170123456".

const LB_MOBILE = /^(3\d{6}|(70|71|76|78|79|81)\d{6})$/;
const LB_LANDLINE = /^[1-9]\d{6}$/;

export type PhoneResult = { ok: true; e164: string; national: boolean } | { ok: false; error: string };

export function normalizePhone(input: string): PhoneResult {
  const raw = (input || "").trim();
  if (!raw) return { ok: false, error: "Phone number is required" };
  if (/[^\d+\s\-().]/.test(raw)) return { ok: false, error: "Phone number contains invalid characters" };
  let digits = raw.replace(/[^\d+]/g, "");
  let international = false;
  if (digits.startsWith("+")) {
    international = true;
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    international = true;
    digits = digits.slice(2);
  }
  if (digits.includes("+")) return { ok: false, error: "Invalid phone number" };

  if (!international && !digits.startsWith("961")) {
    // Local Lebanese format: 03 123 456 / 70 123 456 / 01 234 567
    const local = digits.replace(/^0/, "");
    if (LB_MOBILE.test(local) || LB_LANDLINE.test(local)) return { ok: true, e164: `961${local}`, national: true };
    return { ok: false, error: "Enter a valid Lebanese number (e.g. 03 123 456 or 70 123 456) or include the country code" };
  }

  if (digits.startsWith("961")) {
    const local = digits.slice(3).replace(/^0/, "");
    if (LB_MOBILE.test(local) || LB_LANDLINE.test(local)) return { ok: true, e164: `961${local}`, national: true };
    return { ok: false, error: "Invalid Lebanese phone number" };
  }

  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) {
    return { ok: false, error: "Invalid international phone number" };
  }
  return { ok: true, e164: digits, national: false };
}

export function isLebaneseMobile(e164: string): boolean {
  return e164.startsWith("961") && LB_MOBILE.test(e164.slice(3));
}

export function formatPhone(e164: string): string {
  if (e164.startsWith("961")) {
    const l = e164.slice(3);
    if (l.length === 7) return `+961 ${l.slice(0, 1)} ${l.slice(1, 4)} ${l.slice(4)}`;
    return `+961 ${l.slice(0, 2)} ${l.slice(2, 5)} ${l.slice(5)}`;
  }
  return `+${e164}`;
}
