// Opening hours stored as { mon: [{ open: "10:00", close: "23:00" }], ... }.
// A close earlier than open means the slot runs past midnight.

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Day = (typeof DAYS)[number];
export type Slot = { open: string; close: string };
export type OpeningHours = Partial<Record<Day, Slot[]>>;
export const DAY_LABELS: Record<Day, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

export const TIMEZONE = "Asia/Beirut";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function localParts(date: Date, tz: string): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isOpenAt(hours: OpeningHours | null | undefined, date: Date = new Date(), tz = TIMEZONE): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null; // unknown
  const { day, minutes } = localParts(date, tz);
  const today = hours[DAYS[day]] ?? [];
  for (const s of today) {
    const o = toMinutes(s.open), c = toMinutes(s.close);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return true;
  }
  const yesterday = hours[DAYS[(day + 6) % 7]] ?? [];
  for (const s of yesterday) {
    const o = toMinutes(s.open), c = toMinutes(s.close);
    if (c <= o && minutes < c) return true;
  }
  return false;
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
