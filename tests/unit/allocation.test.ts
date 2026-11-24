import { describe, expect, it } from "vitest";
import { allocatePayments, summarizeCollections } from "@/domain/payments/allocation";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const items = [
  { seq: 1, dueDate: d("2026-01-01"), amountCents: 1000 },
  { seq: 2, dueDate: d("2026-02-01"), amountCents: 2000 },
  { seq: 3, dueDate: d("2026-03-01"), amountCents: 2000 },
  { seq: 4, dueDate: d("2026-06-01"), amountCents: 5000 },
];

describe("payment allocation & collection summary", () => {
  it("allocates oldest-first", () => {
    const a = allocatePayments(items, 2500);
    expect([...a.values()]).toEqual([1000, 1500, 0, 0]);
  });

  it("computes arrears, next due and aging", () => {
    const s = summarizeCollections(items, 2500, d("2026-04-15"));
    expect(s.dueToDateCents).toBe(5000);
    expect(s.arrearsCents).toBe(2500);
    expect(s.nextDue).toEqual({ seq: 2, dueDate: d("2026-02-01"), remainingCents: 500 });
    expect(s.overdueItems.map((o) => o.seq)).toEqual([2, 3]);
    expect(s.aging["61-90"]).toBe(500); // seq 2: 73 days late
    expect(s.aging["31-60"]).toBe(2000); // seq 3: 45 days late
  });

  it("reports no arrears when up to date and credit on overpayment", () => {
    const s = summarizeCollections(items, 11_000, d("2026-12-31"));
    expect(s.arrearsCents).toBe(0);
    expect(s.creditCents).toBe(1000);
    expect(s.nextDue).toBeNull();
    expect(s.paidPct).toBe(100);
  });
});
