/**
 * Money helpers. All money is integer centavos.
 * In the database: BigInt. In domain logic: number (safe up to ±9e15 centavos ≈ ₱90 trillion).
 */
export type Cents = number;

export function toCents(pesos: number | string | null | undefined): Cents {
  if (pesos === null || pesos === undefined || pesos === "") return 0;
  const n = typeof pesos === "string" ? Number(pesos.replace(/[₱,\s]/g, "")) : pesos;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${pesos}`);
  return Math.round(n * 100);
}

export function fromCents(c: Cents | bigint | null | undefined): number {
  if (c === null || c === undefined) return 0;
  return Number(c) / 100;
}

/** BigInt column → number of centavos */
export function n(c: bigint | number | null | undefined): Cents {
  if (c === null || c === undefined) return 0;
  return typeof c === "bigint" ? Number(c) : c;
}

/** number of centavos → BigInt column */
export function b(c: Cents): bigint {
  return BigInt(Math.round(c));
}

const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₱1,234,567.89 */
export function formatPeso(c: Cents | bigint | null | undefined): string {
  return fmt.format(fromCents(c)).replace("PHP", "₱").replace(/^₱\s/, "₱");
}

/** Compact for charts: ₱1.2M */
export function formatPesoCompact(c: Cents | bigint | null | undefined): string {
  const v = fromCents(c);
  if (Math.abs(v) >= 1_000_000_000) return `₱${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₱${(v / 1_000).toFixed(0)}K`;
  return `₱${v.toFixed(0)}`;
}

/** Multiply centavos by a percentage, rounding half-up to the centavo. */
export function pctOf(c: Cents, pct: number): Cents {
  return Math.round((c * pct) / 100);
}

/** Split `total` into `parts` integer amounts; remainder goes to the last part so the sum is exact. */
export function splitEven(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const out = Array.from({ length: parts }, () => base);
  out[parts - 1] += total - base * parts;
  return out;
}

/** Standard amortization payment (PMT) in centavos. annualRatePct e.g. 7.5 */
export function pmt(principal: Cents, annualRatePct: number, months: number): Cents {
  if (months <= 0) return principal;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}
