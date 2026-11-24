import { describe, expect, it } from "vitest";
import { computeLedger, resolveRule, milestoneReached, evaluateTrancheStatuses, DEFAULT_TRANCHES, type CommissionRuleLike } from "@/domain/commissions/tranches";

const rule = (p: Partial<CommissionRuleLike>): CommissionRuleLike => ({ id: "r", name: "r", developmentId: null, brokerageId: null, ratePct: 5, basis: "NSP", brokerageSharePct: 40, agentSharePct: 60, tranches: DEFAULT_TRANCHES, active: true, ...p });

describe("commission rule resolution", () => {
  const rules = [rule({ id: "global" }), rule({ id: "dev", developmentId: "D1" }), rule({ id: "firm", brokerageId: "B1" }), rule({ id: "both", developmentId: "D1", brokerageId: "B1" }), rule({ id: "inactive", developmentId: "D2", active: false })];
  it("prefers development+brokerage, then brokerage, then development, then global", () => {
    expect(resolveRule(rules, { developmentId: "D1", brokerageId: "B1" })!.id).toBe("both");
    expect(resolveRule(rules, { developmentId: "D9", brokerageId: "B1" })!.id).toBe("firm");
    expect(resolveRule(rules, { developmentId: "D1", brokerageId: "B9" })!.id).toBe("dev");
    expect(resolveRule(rules, { developmentId: "D2", brokerageId: null })!.id).toBe("global");
  });
});

describe("ledger computation", () => {
  it("computes earned commission on NSP with split and exact tranches", () => {
    const l = computeLedger({ rule: rule({}), nspCents: 500_000_000, tcpCents: 595_000_000, fallbackPct: 3, hasBrokerage: true });
    expect(l.earnedCents).toBe(25_000_000);
    expect(l.brokerageShareCents).toBe(10_000_000);
    expect(l.agentShareCents).toBe(15_000_000);
    expect(l.tranches.map((t) => t.amountCents)).toEqual([12_500_000, 12_500_000]);
    expect(l.tranches.reduce((a, t) => a + t.brokerageAmountCents, 0)).toBe(l.brokerageShareCents);
    expect(l.tranches.reduce((a, t) => a + t.agentAmountCents, 0)).toBe(l.agentShareCents);
  });

  it("supports TCP basis and broker override rates", () => {
    const l = computeLedger({ rule: rule({ basis: "TCP" }), nspCents: 500_000_000, tcpCents: 595_000_000, brokerOverridePct: 4, fallbackPct: 3, hasBrokerage: true });
    expect(l.ratePct).toBe(4);
    expect(l.earnedCents).toBe(23_800_000);
  });

  it("pays independent brokers 100%", () => {
    const l = computeLedger({ rule: rule({}), nspCents: 100_000_000, tcpCents: 100_000_000, fallbackPct: 3, hasBrokerage: false });
    expect(l.agentShareCents).toBe(l.earnedCents);
    expect(l.brokerageShareCents).toBe(0);
  });

  it("falls back to brokerage default then settings rate without a rule", () => {
    expect(computeLedger({ rule: null, nspCents: 100_000_000, tcpCents: 100_000_000, brokerageDefaultPct: 4.5, fallbackPct: 3, hasBrokerage: true }).ratePct).toBe(4.5);
    expect(computeLedger({ rule: null, nspCents: 100_000_000, tcpCents: 100_000_000, fallbackPct: 3, hasBrokerage: true }).ratePct).toBe(3);
  });

  it("keeps tranche totals exact with awkward percentages", () => {
    const l = computeLedger({ rule: rule({ tranches: [{ label: "a", pct: 33.33, milestoneType: "RESERVATION" }, { label: "b", pct: 33.33, milestoneType: "CONTRACT_SIGNED" }, { label: "c", pct: 33.34, milestoneType: "FULLY_PAID" }] }), nspCents: 123_456_789, tcpCents: 0, fallbackPct: 0, hasBrokerage: true });
    expect(l.tranches.reduce((a, t) => a + t.amountCents, 0)).toBe(l.earnedCents);
  });
});

describe("milestones", () => {
  const ctx = { status: "DOWNPAYMENT_IN_PROGRESS" as const, collectedCents: 0, tcpCents: 1_000_000, dpCents: 200_000 };
  it("collected % of TCP", () => {
    const t = { milestoneType: "COLLECTED_PCT_TCP", milestoneValue: 20 };
    expect(milestoneReached(t, { ...ctx, collectedCents: 199_999 })).toBe(false);
    expect(milestoneReached(t, { ...ctx, collectedCents: 200_000 })).toBe(true);
  });
  it("DP complete by collections or status", () => {
    const t = { milestoneType: "DP_COMPLETE", milestoneValue: null };
    expect(milestoneReached(t, { ...ctx, collectedCents: 150_000 })).toBe(false);
    expect(milestoneReached(t, { ...ctx, collectedCents: 200_000 })).toBe(true);
    expect(milestoneReached(t, { ...ctx, status: "DOWNPAYMENT_COMPLETE" })).toBe(true);
  });
  it("contract signed by status", () => {
    const t = { milestoneType: "CONTRACT_SIGNED", milestoneValue: null };
    expect(milestoneReached(t, { ...ctx, status: "DOCUMENTATION" })).toBe(false);
    expect(milestoneReached(t, { ...ctx, status: "CONTRACT_SIGNED" })).toBe(true);
  });
  it("nothing is due on cancelled transactions", () => {
    expect(milestoneReached({ milestoneType: "RESERVATION", milestoneValue: null }, { ...ctx, status: "CANCELLED" })).toBe(false);
  });
  it("evaluates status changes without touching approved/released", () => {
    const tranches = [
      { id: "a", status: "NOT_DUE", milestoneType: "COLLECTED_PCT_TCP", milestoneValue: 20 },
      { id: "b", status: "DUE", milestoneType: "DP_COMPLETE", milestoneValue: null },
      { id: "c", status: "APPROVED", milestoneType: "DP_COMPLETE", milestoneValue: null },
      { id: "d", status: "RELEASED", milestoneType: "FULLY_PAID", milestoneValue: null },
    ];
    const r = evaluateTrancheStatuses(tranches, { ...ctx, collectedCents: 250_000 - 100_000 });
    expect(r.toDue).toEqual([]);
    expect(r.toNotDue).toEqual(["b"]);
    const r2 = evaluateTrancheStatuses(tranches, { ...ctx, collectedCents: 250_000 });
    expect(r2.toDue).toEqual(["a"]);
    expect(r2.toNotDue).toEqual([]);
  });
});
