/**
 * Normalises a WhatsApp number to E.164 ("+96170123456").
 * Accepts "+961 70 123 456", "00961-70-123456", "(+961) 70123456".
 * Returns null unless it starts with a country code.
 */
export function normalizeWhatsapp(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!/^\+[1-9]\d{6,14}$/.test(s)) return null;
  return s;
}

export function whatsappMessage(headline: string): string {
  return `Hi, I saw your task on Yalla Ok: ${headline}. I’m interested in doing it.`;
}

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini|webOS|BlackBerry/i.test(ua ?? "");
}

/**
 * Phones: wa.me opens the WhatsApp app (or the store if it's missing).
 * Computers: go straight to WhatsApp Web's chat screen.
 */
export function whatsappUrl(e164: string, text: string, mobile: boolean): string {
  const phone = e164.replace(/^\+/, "");
  const t = encodeURIComponent(text);
  return mobile
    ? `https://wa.me/${phone}?text=${t}`
    : `https://web.whatsapp.com/send?phone=${phone}&text=${t}`;
}
