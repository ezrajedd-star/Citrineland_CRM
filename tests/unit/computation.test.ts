import { describe, expect, it } from "vitest";
import { computeSample } from "@/domain/pricing/computation";
import { settings, dpBank, spotCash, deferred, spotDp, condo5m } from "./fixtures";

describe("sample computation", () => {
  it("computes NSP, VAT, misc fees, TCP and DP for a DP + bank scheme", () => {
    const c = computeSample({ items: [condo5m], scheme: dpBank, settings });
    expect(c.netSellingPriceCents).toBe(500_000_000);
    expect(c.vatCents).toBe(60_000_000); // 12%
    expect(c.miscFeesCents).toBe(35_000_000); // 7% of NSP
    expect(c.tcpCents).toBe(595_000_000);
    expect(c.dpGrossCents).toBe(119_000_000);
    expect(c.dpNetPayableCents).toBe(116_500_000); // less ₱25,000 reservation fee
    expect(c.dpMonthlyCents).toBe(3_236_111);
    expect(c.balanceCents).toBe(476_000_000);
    expect(c.totalPayableCents).toBe(c.tcpCents);
    const bank = c.amortization.find((a) => a.financing === "BANK")!;
    expect(bank.isSchemeFinancing).toBe(true);
    expect(bank.monthlyCents).toBeGreaterThan(3_800_000);
    expect(bank.monthlyCents).toBeLessThan(3_900_000); // ≈ ₱38,346/mo on ₱4.76M @7.5%/20y
    expect(c.amortization).toHaveLength(3);
  });

  it("applies the spot cash discount before VAT and fees", () => {
    const c = computeSample({ items: [condo5m], scheme: spotCash, settings });
    expect(c.spotCashDiscountCents).toBe(40_000_000);
    expect(c.netSellingPriceCents).toBe(460_000_000);
    expect(c.vatCents).toBe(55_200_000);
    expect(c.miscFeesCents).toBe(32_200_000);
    expect(c.tcpCents).toBe(547_400_000);
    expect(c.spotBalanceCents).toBe(547_400_000 - 2_500_000);
    expect(c.amortization).toHaveLength(0);
  });

  it("does not charge VAT at or below the residential threshold", () => {
    const c = computeSample({ items: [{ ...condo5m, listPriceCents: 300_000_000 }], scheme: dpBank, settings });
    expect(c.vatCents).toBe(0);
    expect(c.lines[0].vatable).toBe(false);
    expect(c.tcpCents).toBe(321_000_000);
  });

  it("treats parking as VATable when configured, even when bundled with an exempt unit", () => {
    const c = computeSample({ items: [{ ...condo5m, listPriceCents: 300_000_000 }, { kind: "PARKING", code: "B1-001", listPriceCents: 85_000_000 }], scheme: dpBank, settings });
    expect(c.lines[0].vatCents).toBe(0);
    expect(c.lines[1].vatCents).toBe(10_200_000);
    expect(c.vatCents).toBe(10_200_000);
  });

  it("shows VAT for information only when prices include VAT", () => {
    const s = { ...settings, vat: { ...settings.vat, pricesIncludeVat: true } };
    const c = computeSample({ items: [condo5m], scheme: dpBank, settings: s });
    expect(c.vatCents).toBe(Math.round((500_000_000 * 12) / 112));
    expect(c.tcpCents).toBe(500_000_000 + 35_000_000);
  });

  it("can keep misc fees outside the TCP", () => {
    const s = { ...settings, miscFees: { pct: 7, includeInTcp: false } };
    const c = computeSample({ items: [condo5m], scheme: dpBank, settings: s });
    expect(c.tcpCents).toBe(560_000_000);
    expect(c.miscFeesCents).toBe(35_000_000);
  });

  it("applies the spot DP discount to the down payment only", () => {
    const c = computeSample({ items: [condo5m], scheme: spotDp, settings });
    expect(c.dpGrossCents).toBe(59_500_000);
    expect(c.spotDpDiscountCents).toBe(2_975_000);
    expect(c.dpNetPayableCents).toBe(59_500_000 - 2_500_000 - 2_975_000);
    expect(c.balanceCents).toBe(535_500_000);
    expect(c.totalPayableCents).toBe(595_000_000 - 2_975_000);
  });

  it("splits deferred cash into equal monthly payments", () => {
    const c = computeSample({ items: [condo5m], scheme: deferred, settings });
    expect(c.deferredMonths).toBe(36);
    expect(c.deferredMonthlyCents).toBe(Math.floor((595_000_000 - 2_500_000) / 36));
  });

  it("applies promo discounts (percent then amount) and allocates them across items", () => {
    const c = computeSample({ items: [condo5m, { kind: "PARKING", code: "B1-001", listPriceCents: 100_000_000 }], scheme: dpBank, settings, discountPct: 5, discountAmountCents: 1_000_000 });
    expect(c.promoDiscountCents).toBe(30_000_000 + 1_000_000);
    expect(c.lines.reduce((a, l) => a + l.discountCents, 0)).toBe(31_000_000);
    expect(c.netSellingPriceCents).toBe(600_000_000 - 31_000_000);
  });

  it("never produces fractional centavos", () => {
    const c = computeSample({ items: [{ ...condo5m, listPriceCents: 487_654_321 }], scheme: dpBank, settings, discountPct: 3.33 });
    for (const v of [c.vatCents, c.miscFeesCents, c.tcpCents, c.dpGrossCents, c.dpMonthlyCents, c.balanceCents]) expect(Number.isInteger(v)).toBe(true);
  });
});
