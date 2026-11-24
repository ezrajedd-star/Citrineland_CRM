/** Normalize a person's name for duplicate detection: lowercase, strip accents/punctuation, collapse spaces. */
export function normalizeName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const v = e.trim().toLowerCase();
  return v || null;
}

/**
 * Normalize a Philippine mobile number to E.164 (+639XXXXXXXXX).
 * Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +63 9XX XXX XXXX. Returns null if not a PH mobile.
 */
export function normalizePhMobile(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  let local: string | null = null;
  if (/^09\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^9\d{9}$/.test(digits)) local = digits;
  else if (/^639\d{9}$/.test(digits)) local = digits.slice(2);
  if (!local) return null;
  return `+63${local}`;
}

/** +63 9XX XXX XXXX */
export function formatPhMobile(p: string | null | undefined): string {
  if (!p) return "—";
  const e164 = normalizePhMobile(p);
  if (!e164) return p;
  const l = e164.slice(3);
  return `+63 ${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}`;
}
