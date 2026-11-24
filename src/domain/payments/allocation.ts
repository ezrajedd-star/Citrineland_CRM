import type { Cents } from "@/lib/money";

export interface DueItem {
  seq: number;
  dueDate: Date;
  amountCents: Cents;
  kind?: string;
}

/** Allocate total collections to schedule items oldest-first. Returns paid amount per seq. */
export function allocatePayments(items: DueItem[], totalPaidCents: Cents): Map<number, Cents> {
  const sorted = [...items].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.seq - b.seq);
  const out = new Map<number, Cents>();
  let left = Math.max(0, totalPaidCents);
  for (const it of sorted) {
    const applied = Math.min(left, it.amountCents);
    out.set(it.seq, applied);
    left -= applied;
  }
  return out;
}

export interface CollectionSummary {
  totalScheduledCents: Cents;
  dueToDateCents: Cents;
  paidCents: Cents;
  arrearsCents: Cents;
  /** Overpayment beyond the full schedule */
  creditCents: Cents;
  nextDue: { seq: number; dueDate: Date; remainingCents: Cents } | null;
  overdueItems: { seq: number; dueDate: Date; remainingCents: Cents; daysLate: number }[];
  aging: { "1-30": Cents; "31-60": Cents; "61-90": Cents; "90+": Cents };
  paidPct: number;
}

/** Paid vs due, arrears, next due date, and arrears aging as of a date. */
export function summarizeCollections(items: DueItem[], totalPaidCents: Cents, asOf: Date): CollectionSummary {
  const alloc = allocatePayments(items, totalPaidCents);
  const total = items.reduce((a, i) => a + i.amountCents, 0);
  const sorted = [...items].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.seq - b.seq);
  const dueToDate = sorted.filter((i) => i.dueDate.getTime() <= asOf.getTime()).reduce((a, i) => a + i.amountCents, 0);
  const aging = { "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const overdue: CollectionSummary["overdueItems"] = [];
  let nextDue: CollectionSummary["nextDue"] = null;
  for (const it of sorted) {
    const remaining = it.amountCents - (alloc.get(it.seq) ?? 0);
    if (remaining <= 0) continue;
    const daysLate = Math.floor((asOf.getTime() - it.dueDate.getTime()) / 86_400_000);
    if (daysLate > 0) {
      overdue.push({ seq: it.seq, dueDate: it.dueDate, remainingCents: remaining, daysLate });
      const bucket = daysLate <= 30 ? "1-30" : daysLate <= 60 ? "31-60" : daysLate <= 90 ? "61-90" : "90+";
      aging[bucket] += remaining;
    }
    if (!nextDue) nextDue = { seq: it.seq, dueDate: it.dueDate, remainingCents: remaining };
  }
  const paid = Math.max(0, totalPaidCents);
  return {
    totalScheduledCents: total,
    dueToDateCents: dueToDate,
    paidCents: paid,
    arrearsCents: Math.max(0, dueToDate - paid),
    creditCents: Math.max(0, paid - total),
    nextDue,
    overdueItems: overdue,
    aging,
    paidPct: total ? Math.min(100, (paid / total) * 100) : 0,
  };
}
