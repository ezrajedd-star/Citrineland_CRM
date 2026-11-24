import { describe, expect, it } from "vitest";
import { computeSample } from "@/domain/pricing/computation";
import { generateSchedule, addMonths, amortizationTable } from "@/domain/payments/schedule";
import { settings, dpBank, spotCash, deferred, spotDp, inHouse, condo5m } from "./fixtures";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const sum = (xs: { amountCents: number }[]) => xs.reduce((a, x) => a + x.amountCents, 0);

describe("addMonths", () => {
  it("clamps to month end", () => {
    expect(addMonths(d("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(d("2028-01-31"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(addMonths(d("2026-02-28"), 1, 31).toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(addMonths(d("2026-11-15"), 2).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("payment schedule generation", () => {
  const opts = { reservationDate: d("2026-11-24"), spotCashDueDays: 30 };

  it("DP + bank: reservation fee, 36 DP installments, loan takeout; totals equal TCP", () => {
    const c = computeSample({ items: [condo5m], scheme: dpBank, settings });
    const s = generateSchedule(c, dpBank, opts);
    expect(s[0]).toMatchObject({ kind: "RESERVATION", amountCents: 2_500_000, seq: 1 });
    const dp = s.filter((x) => x.kind === "DOWNPAYMENT");
    expect(dp).toHaveLength(36);
    expect(sum(dp)).toBe(c.dpNetPayableCents);
    expect(dp[0].dueDate.toISOString().slice(0, 10)).toBe("2026-12-24");
    expect(dp[35].dueDate.toISOString().slice(0, 10)).toBe("2029-11-24");
    const bal = s.filter((x) => x.kind === "BALANCE");
    expect(bal).toHaveLength(1);
    expect(bal[0].amountCents).toBe(476_000_000);
    expect(bal[0].dueDate.toISOString().slice(0, 10)).toBe("2029-12-24");
    expect(sum(s)).toBe(c.tcpCents);
    expect(s.map((x) => x.seq)).toEqual(s.map((_, i) => i + 1));
  });

  it("spot cash: reservation + balance due in N days", () => {
    const c = computeSample({ items: [condo5m], scheme: spotCash, settings });
    const s = generateSchedule(c, spotCash, opts);
    expect(s).toHaveLength(2);
    expect(s[1].kind).toBe("SPOT");
    expect(s[1].dueDate.toISOString().slice(0, 10)).toBe("2026-12-24");
    expect(sum(s)).toBe(c.tcpCents);
  });

  it("deferred cash: equal payments whose sum is exact", () => {
    const c = computeSample({ items: [condo5m], scheme: deferred, settings });
    const s = generateSchedule(c, deferred, opts);
    expect(s.filter((x) => x.kind === "DEFERRED")).toHaveLength(36);
    expect(sum(s)).toBe(c.tcpCents);
  });

  it("spot DP: single DP line; total equals TCP less the spot DP discount", () => {
    const c = computeSample({ items: [condo5m], scheme: spotDp, settings });
    const s = generateSchedule(c, spotDp, { ...opts, firstDueDate: d("2026-12-01") });
    const dp = s.filter((x) => x.kind === "DOWNPAYMENT");
    expect(dp).toHaveLength(1);
    expect(dp[0].dueDate.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(sum(s)).toBe(c.totalPayableCents);
  });

  it("in-house financing: amortization principal pays off the balance exactly", () => {
    const c = computeSample({ items: [condo5m], scheme: inHouse, settings });
    const s = generateSchedule(c, inHouse, opts);
    const am = s.filter((x) => x.kind === "AMORTIZATION");
    expect(am).toHaveLength(60);
    expect(am.reduce((a, x) => a + (x.principalCents ?? 0), 0)).toBe(c.balanceCents);
    expect(am.every((x) => x.amountCents === (x.principalCents ?? 0) + (x.interestCents ?? 0))).toBe(true);
    expect(am[0].interestCents).toBe(Math.round((c.balanceCents * 0.16) / 12));
  });

  it("amortization table ends at zero", () => {
    const rows = amortizationTable(1_000_000_00, 12, 24);
    expect(rows.at(-1)!.remaining).toBe(0);
    expect(rows.reduce((a, r) => a + r.principal, 0)).toBe(1_000_000_00);
  });
});
