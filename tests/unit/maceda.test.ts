import { describe, expect, it } from "vitest";
import { computeMaceda } from "@/domain/maceda";

const paid = 1_000_000_00; // ₱1,000,000

describe("Maceda Law (RA 6552) helper", () => {
  it("less than 2 years: no refund, 60-day grace", () => {
    const r = computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 23, isInstallmentSale: true });
    expect(r.qualifiesForRefund).toBe(false);
    expect(r.cashSurrenderValueCents).toBe(0);
    expect(r.gracePeriod).toEqual({ months: 0, days: 60 });
  });

  it("exactly 2 years: 50%, 2 months grace", () => {
    const r = computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 24, isInstallmentSale: true });
    expect(r.cashSurrenderPct).toBe(50);
    expect(r.cashSurrenderValueCents).toBe(500_000_00);
    expect(r.gracePeriod.months).toBe(2);
  });

  it("5 years: still 50%", () => {
    expect(computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 60, isInstallmentSale: true }).cashSurrenderPct).toBe(50);
  });

  it("adds 5% per year after the 5th year", () => {
    expect(computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 72, isInstallmentSale: true }).cashSurrenderPct).toBe(55);
    expect(computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 120, isInstallmentSale: true }).cashSurrenderPct).toBe(75);
  });

  it("caps at 90%", () => {
    const r = computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 14 * 12, isInstallmentSale: true });
    expect(r.cashSurrenderPct).toBe(90);
    expect(r.cashSurrenderValueCents).toBe(900_000_00);
    expect(computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 30 * 12, isInstallmentSale: true }).cashSurrenderPct).toBe(90);
  });

  it("counts only full years", () => {
    expect(computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 35, isInstallmentSale: true }).yearsPaid).toBe(2);
  });

  it("is not applicable to non-installment sales", () => {
    const r = computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: 0, isInstallmentSale: false });
    expect(r.applicable).toBe(false);
    expect(r.cashSurrenderValueCents).toBe(0);
  });
});
