import { pctOf, type Cents } from "@/lib/money";
import type { TxStatus } from "../transactions/state-machine";

/**
 * Commission rules, ledger computation and milestone-based release tranches.
 * Pure functions — persistence lives in src/server/commissions.ts.
 */
export type MilestoneType = "RESERVATION" | "COLLECTED_PCT_TCP" | "CONTRACT_SIGNED" | "DP_COMPLETE" | "LOAN_TAKEOUT" | "FULLY_PAID";

export interface TrancheRule {
  label: string;
  pct: number;
  milestoneType: MilestoneType;
  milestoneValue?: number | null;
}

export interface CommissionRuleLike {
  id: string;
  name: string;
  developmentId: string | null;
  brokerageId: string | null;
  ratePct: number;
  basis: "NSP" | "TCP";
  brokerageSharePct: number;
  agentSharePct: number;
  tranches: TrancheRule[];
  active: boolean;
}

/** Most specific active rule wins: development+brokerage > brokerage > development > global. */
export function resolveRule<R extends CommissionRuleLike>(rules: R[], ctx: { developmentId: string; brokerageId: string | null }): R | null {
  const score = (r: R) => {
    if (!r.active) return -1;
    if (r.developmentId && r.developmentId !== ctx.developmentId) return -1;
    if (r.brokerageId && r.brokerageId !== ctx.brokerageId) return -1;
    return (r.brokerageId ? 2 : 0) + (r.developmentId ? 1 : 0);
  };
  return rules.map((r) => ({ r, s: score(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.r ?? null;
}

export const DEFAULT_TRANCHES: TrancheRule[] = [
  { label: "50% upon 20% of TCP collected", pct: 50, milestoneType: "COLLECTED_PCT_TCP", milestoneValue: 20 },
  { label: "50% upon full down payment", pct: 50, milestoneType: "DP_COMPLETE" },
];

export interface LedgerInput {
  rule: Pick<CommissionRuleLike, "ratePct" | "basis" | "brokerageSharePct" | "agentSharePct" | "tranches"> | null;
  nspCents: Cents;
  tcpCents: Cents;
  /** Broker's personal override rate takes precedence over the rule's rate */
  brokerOverridePct?: number | null;
  brokerageDefaultPct?: number | null;
  fallbackPct: number;
  /** Independent brokers (no brokerage) receive the full commission */
  hasBrokerage: boolean;
}

export interface LedgerTranche {
  seq: number;
  label: string;
  pct: number;
  milestoneType: MilestoneType;
  milestoneValue: number | null;
  amountCents: Cents;
  brokerageAmountCents: Cents;
  agentAmountCents: Cents;
}

export interface LedgerComputation {
  basis: "NSP" | "TCP";
  basisCents: Cents;
  ratePct: number;
  earnedCents: Cents;
  brokerageSharePct: number;
  agentSharePct: number;
  brokerageShareCents: Cents;
  agentShareCents: Cents;
  tranches: LedgerTranche[];
}

/** Earned commission, brokerage/agent split and tranche amounts — all sums exact to the centavo. */
export function computeLedger(input: LedgerInput): LedgerComputation {
  const basis = input.rule?.basis ?? "NSP";
  const basisCents = basis === "TCP" ? input.tcpCents : input.nspCents;
  const ratePct = input.brokerOverridePct ?? input.rule?.ratePct ?? input.brokerageDefaultPct ?? input.fallbackPct;
  const earned = pctOf(basisCents, ratePct);
  let bPct = input.rule?.brokerageSharePct ?? 100;
  let aPct = input.rule?.agentSharePct ?? 0;
  if (!input.hasBrokerage) {
    bPct = 0;
    aPct = 100;
  }
  const brokerageShare = pctOf(earned, bPct);
  const agentShare = earned - brokerageShare;
  const rules = input.rule?.tranches?.length ? input.rule.tranches : DEFAULT_TRANCHES;
  let allocated = 0;
  let allocB = 0;
  const tranches = rules.map((t, i) => {
    const last = i === rules.length - 1;
    const amount = last ? earned - allocated : pctOf(earned, t.pct);
    const bAmt = last ? brokerageShare - allocB : pctOf(amount, bPct);
    allocated += amount;
    allocB += bAmt;
    return { seq: i + 1, label: t.label, pct: t.pct, milestoneType: t.milestoneType, milestoneValue: t.milestoneValue ?? null, amountCents: amount, brokerageAmountCents: bAmt, agentAmountCents: amount - bAmt };
  });
  return { basis, basisCents, ratePct, earnedCents: earned, brokerageSharePct: bPct, agentSharePct: aPct, brokerageShareCents: brokerageShare, agentShareCents: agentShare, tranches };
}

const LIFECYCLE: TxStatus[] = ["RESERVED", "DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS", "DOWNPAYMENT_COMPLETE", "FOR_LOAN_TAKEOUT", "BALANCE_IN_PROGRESS", "FULLY_PAID", "TURNED_OVER", "TITLED"];
function reached(status: TxStatus, target: TxStatus) {
  const a = LIFECYCLE.indexOf(status);
  const b = LIFECYCLE.indexOf(target);
  if (a < 0 || b < 0) return false;
  // FOR_LOAN_TAKEOUT and BALANCE_IN_PROGRESS are parallel branches after DP complete
  if (target === "FOR_LOAN_TAKEOUT" && status === "BALANCE_IN_PROGRESS") return false;
  return a >= b;
}

export interface MilestoneContext {
  status: TxStatus;
  collectedCents: Cents;
  tcpCents: Cents;
  /** Gross down payment (including reservation fee); for spot/deferred cash use the TCP */
  dpCents: Cents;
}

export function milestoneReached(t: { milestoneType: string; milestoneValue: number | null }, c: MilestoneContext): boolean {
  if (c.status === "CANCELLED" || c.status === "TRANSFERRED") return false;
  switch (t.milestoneType as MilestoneType) {
    case "RESERVATION":
      return true;
    case "COLLECTED_PCT_TCP":
      return c.collectedCents >= pctOf(c.tcpCents, t.milestoneValue ?? 0);
    case "CONTRACT_SIGNED":
      return reached(c.status, "CONTRACT_SIGNED");
    case "DP_COMPLETE":
      return c.collectedCents >= (c.dpCents > 0 ? c.dpCents : c.tcpCents) || reached(c.status, "DOWNPAYMENT_COMPLETE");
    case "LOAN_TAKEOUT":
      return reached(c.status, "FULLY_PAID") || c.collectedCents >= c.tcpCents;
    case "FULLY_PAID":
      return reached(c.status, "FULLY_PAID") || c.collectedCents >= c.tcpCents;
    default:
      return false;
  }
}

/**
 * Decide tranche status changes. NOT_DUE → DUE when the milestone is reached; DUE → NOT_DUE if a voided payment
 * un-reaches it. APPROVED/RELEASED/FORFEITED are never changed here.
 */
export function evaluateTrancheStatuses<T extends { id: string; status: string; milestoneType: string; milestoneValue: number | null }>(tranches: T[], c: MilestoneContext) {
  const toDue: string[] = [];
  const toNotDue: string[] = [];
  for (const t of tranches) {
    const ok = milestoneReached(t, c);
    if (t.status === "NOT_DUE" && ok) toDue.push(t.id);
    if (t.status === "DUE" && !ok) toNotDue.push(t.id);
  }
  return { toDue, toNotDue };
}

export const FORFEITABLE = ["NOT_DUE", "DUE", "APPROVED"] as const;
