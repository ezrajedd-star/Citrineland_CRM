export const TZ = "Asia/Manila";

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
// Date-only columns (@db.Date) are stored at UTC midnight; format them in UTC so the day never shifts.
const dateOnlyFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

type D = Date | string | null | undefined;
const toDate = (d: D) => (d ? (d instanceof Date ? d : new Date(d)) : null);

/** Nov 24, 2026 (Asia/Manila) */
export function formatDate(d: D): string {
  const x = toDate(d);
  return x ? dateFmt.format(x) : "—";
}
/** For @db.Date columns */
export function formatDay(d: D): string {
  const x = toDate(d);
  return x ? dateOnlyFmt.format(x) : "—";
}
export function formatDateTime(d: D): string {
  const x = toDate(d);
  return x ? dateTimeFmt.format(x) : "—";
}

/** YYYY-MM-DD for the given instant in Manila */
export function manilaDateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}

/** Today's date (Manila) as a UTC-midnight Date suitable for @db.Date columns */
export function manilaToday(): Date {
  return new Date(`${manilaDateKey()}T00:00:00.000Z`);
}

/** Parse 'YYYY-MM-DD' into a UTC-midnight Date */
export function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** UTC-midnight Date → 'YYYY-MM-DD' (for <input type="date">) */
export function dayInput(d: D): string {
  const x = toDate(d);
  return x ? x.toISOString().slice(0, 10) : "";
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function relativeDays(d: D): string {
  const x = toDate(d);
  if (!x) return "—";
  const days = daysBetween(x, new Date());
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  return days > 0 ? `${days}d ago` : `in ${-days}d`;
}

export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}
