import { pmt, splitEven, type Cents } from "@/lib/money";
import type { ComputationResult, SchemeSnapshot } from "../pricing/computation";

export type ScheduleKind = "RESERVATION" | "SPOT" | "DEFERRED" | "DOWNPAYMENT" | "BALANCE" | "AMORTIZATION";

export interface ScheduleLine {
  seq: number;
  kind: ScheduleKind;
  label: string;
  dueDate: Date;
  amountCents: Cents;
  principalCents?: Cents;
  interestCents?: Cents;
}

/** Add calendar months to a UTC-midnight date, clamping to month end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, months: number, anchorDay = d.getUTCDate()): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, last)));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * Generate the payment schedule at reservation from the frozen computation result.
 * Invariant: sum(amount) of non-amortization lines + principal of amortization lines == TCP − spot DP discount.
 */
export function generateSchedule(
  c: ComputationResult,
  scheme: SchemeSnapshot,
  opts: { reservationDate: Date; firstDueDate?: Date | null; spotCashDueDays: number },
): ScheduleLine[] {
  const lines: Omit<ScheduleLine, "seq">[] = [];
  const first = opts.firstDueDate ?? addMonths(opts.reservationDate, 1);
  const anchor = first.getUTCDate();
  if (c.reservationFeeCents > 0) lines.push({ kind: "RESERVATION", label: "Reservation fee", dueDate: opts.reservationDate, amountCents: c.reservationFeeCents });

  if (c.schemeKind === "SPOT_CASH") {
    if (c.spotBalanceCents > 0) lines.push({ kind: "SPOT", label: "Spot cash balance", dueDate: addDays(opts.reservationDate, opts.spotCashDueDays), amountCents: c.spotBalanceCents });
  } else if (c.schemeKind === "DEFERRED_CASH") {
    const parts = splitEven(c.tcpCents - c.reservationFeeCents, c.deferredMonths);
    parts.forEach((amt, i) => lines.push({ kind: "DEFERRED", label: `Deferred payment ${i + 1}/${parts.length}`, dueDate: addMonths(first, i, anchor), amountCents: amt }));
  } else {
    let lastDue = opts.reservationDate;
    if (c.dpNetPayableCents > 0) {
      if (c.dpMonths === 0) {
        lines.push({ kind: "DOWNPAYMENT", label: "Down payment (spot)", dueDate: first, amountCents: c.dpNetPayableCents });
        lastDue = first;
      } else {
        const parts = splitEven(c.dpNetPayableCents, c.dpMonths);
        parts.forEach((amt, i) => {
          const due = addMonths(first, i, anchor);
          lines.push({ kind: "DOWNPAYMENT", label: `Down payment ${i + 1}/${parts.length}`, dueDate: due, amountCents: amt });
          lastDue = due;
        });
      }
    }
    if (c.balanceCents > 0) {
      const balanceStart = addMonths(lastDue, 1, anchor);
      if (scheme.financing === "IN_HOUSE") {
        const rate = scheme.interestRatePct ?? c.amortization.find((a) => a.financing === "IN_HOUSE")?.ratePct ?? 0;
        const term = scheme.termMonths ?? c.amortization.find((a) => a.financing === "IN_HOUSE")?.termMonths ?? 12;
        for (const row of amortizationTable(c.balanceCents, rate, term)) {
          lines.push({
            kind: "AMORTIZATION",
            label: `In-house amortization ${row.n}/${term}`,
            dueDate: addMonths(balanceStart, row.n - 1, anchor),
            amountCents: row.principal + row.interest,
            principalCents: row.principal,
            interestCents: row.interest,
          });
        }
      } else {
        const via = scheme.financing === "PAGIBIG" ? "Pag-IBIG" : "bank";
        lines.push({ kind: "BALANCE", label: `Balance via ${via} loan takeout`, dueDate: balanceStart, amountCents: c.balanceCents });
      }
    }
  }
  return lines.map((l, i) => ({ ...l, seq: i + 1 }));
}

/** Level-payment amortization with exact principal payoff (last row absorbs rounding). */
export function amortizationTable(principal: Cents, annualRatePct: number, months: number) {
  const payment = pmt(principal, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  let remaining = principal;
  const rows: { n: number; principal: Cents; interest: Cents; remaining: Cents }[] = [];
  for (let n = 1; n <= months; n++) {
    const interest = Math.round(remaining * r);
    let princ = payment - interest;
    if (n === months || princ > remaining) princ = remaining;
    remaining -= princ;
    rows.push({ n, principal: princ, interest, remaining });
  }
  return rows;
}
