import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { formatPeso } from "@/lib/money";
import { DomainError } from "@/domain/errors";
import { computeLedger, evaluateTrancheStatuses, resolveRule, FORFEITABLE, type CommissionRuleLike, type TrancheRule } from "@/domain/commissions/tranches";
import type { TxStatus } from "@/domain/transactions/state-machine";
import { notifyUsers, usersWithPermission } from "./notifications";
import { logActivity } from "./activities";

/** Create the commission ledger at reservation (only when there is a broker of record). Idempotent. */
export async function createLedgerForTransaction(tx: Tx, transactionId: string, ctx: ActorCtx) {
  const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { broker: true, brokerage: true, ledger: true } });
  if (!t.brokerId || t.ledger) return null;
  const rules = await tx.commissionRule.findMany({ where: { active: true } });
  const rule = resolveRule(
    rules.map((r) => ({ ...r, tranches: r.tranches as unknown as TrancheRule[] })) as (CommissionRuleLike & { id: string })[],
    { developmentId: t.developmentId, brokerageId: t.brokerageId },
  );
  const settings = await getSettings();
  const l = computeLedger({
    rule,
    nspCents: Number(t.netSellingPriceCents),
    tcpCents: Number(t.tcpCents),
    brokerOverridePct: t.broker?.commissionRateOverridePct,
    brokerageDefaultPct: t.brokerage?.defaultCommissionPct,
    fallbackPct: settings.defaultCommissionPct,
    hasBrokerage: Boolean(t.brokerageId),
  });
  const ledger = await tx.commissionLedger.create({
    data: {
      transactionId,
      ruleId: rule?.id ?? null,
      ruleSnapshot: { rule: rule ? { id: rule.id, name: rule.name } : null, ratePct: l.ratePct, basis: l.basis, split: [l.brokerageSharePct, l.agentSharePct] } as any,
      brokerageId: t.brokerageId,
      brokerId: t.brokerId,
      basis: l.basis,
      basisCents: BigInt(l.basisCents),
      ratePct: l.ratePct,
      earnedCents: BigInt(l.earnedCents),
      brokerageShareCents: BigInt(l.brokerageShareCents),
      agentShareCents: BigInt(l.agentShareCents),
      tranches: {
        create: l.tranches.map((tr) => ({
          seq: tr.seq,
          label: tr.label,
          pct: tr.pct,
          milestoneType: tr.milestoneType,
          milestoneValue: tr.milestoneValue,
          amountCents: BigInt(tr.amountCents),
          brokerageAmountCents: BigInt(tr.brokerageAmountCents),
          agentAmountCents: BigInt(tr.agentAmountCents),
        })),
      },
    },
  });
  await audit(ctx, { entity: "CommissionLedger", entityId: ledger.id, action: "create", after: { transactionId, earnedCents: l.earnedCents, ratePct: l.ratePct, rule: rule?.name } }, tx);
  return ledger;
}

/**
 * Re-evaluate milestones after payments/status changes. Tranches become DUE automatically when recorded
 * collections reach their milestone; Sales Managers (commissions:approve) are notified. Returns newly-due ids.
 */
export async function evaluateTranches(tx: Tx, transactionId: string, ctx: ActorCtx): Promise<string[]> {
  const ledger = await tx.commissionLedger.findUnique({ where: { transactionId }, include: { tranches: true, transaction: { include: { client: true } } } });
  if (!ledger) return [];
  const t = ledger.transaction;
  const paid = await tx.payment.aggregate({ where: { transactionId, voidedAt: null }, _sum: { amountCents: true } });
  const pricing = (t.pricingSnapshot ?? {}) as any;
  const dp = pricing.schemeKind === "DP_BALANCE" ? Number(t.downpaymentCents) : Number(t.tcpCents);
  const r = evaluateTrancheStatuses(
    ledger.tranches.map((x) => ({ id: x.id, status: x.status, milestoneType: x.milestoneType, milestoneValue: x.milestoneValue })),
    { status: t.status as TxStatus, collectedCents: Number(paid._sum.amountCents ?? 0n), tcpCents: Number(t.tcpCents), dpCents: dp },
  );
  if (r.toDue.length) await tx.commissionTranche.updateMany({ where: { id: { in: r.toDue } }, data: { status: "DUE", dueAt: new Date() } });
  if (r.toNotDue.length) await tx.commissionTranche.updateMany({ where: { id: { in: r.toNotDue } }, data: { status: "NOT_DUE", dueAt: null } });
  if (r.toDue.length) {
    const due = ledger.tranches.filter((x) => r.toDue.includes(x.id));
    const total = due.reduce((a, x) => a + x.amountCents, 0n);
    await logActivity({ type: "SYSTEM", subject: `Commission tranche(s) due: ${due.map((d) => d.label).join(", ")} (${formatPeso(total)})`, transactionId, brokerId: ledger.brokerId, actorId: ctx.userId }, tx);
    const { automationEnabled } = await import("./automation/engine");
    const approvers = (await automationEnabled("commission_due")) ? await usersWithPermission("commissions:approve", tx) : [];
    await notifyUsers(approvers, { title: `Commission due — ${t.code}`, body: `${due.map((d) => d.label).join("; ")}: ${formatPeso(total)}`, link: `/commissions?status=DUE`, kind: "COMMISSION", dedupeKey: `tranche-due:${r.toDue.sort().join(",")}` }, tx);
    await audit(ctx, { entity: "CommissionLedger", entityId: ledger.id, action: "tranches_due", after: { trancheIds: r.toDue } }, tx);
  }
  if (r.toNotDue.length) await audit(ctx, { entity: "CommissionLedger", entityId: ledger.id, action: "tranches_not_due", after: { trancheIds: r.toNotDue } }, tx);
  return r.toDue;
}

/** On cancellation/transfer: unreleased tranches are forfeited. Released ones stay (clawback is a manual adjustment). */
export async function forfeitUnreleased(tx: Tx, transactionId: string, ctx: ActorCtx) {
  const ledger = await tx.commissionLedger.findUnique({ where: { transactionId }, include: { tranches: true } });
  if (!ledger) return;
  const ids = ledger.tranches.filter((t) => (FORFEITABLE as readonly string[]).includes(t.status)).map((t) => t.id);
  if (!ids.length) return;
  await tx.commissionTranche.updateMany({ where: { id: { in: ids } }, data: { status: "FORFEITED", forfeitedAt: new Date() } });
  await audit(ctx, { entity: "CommissionLedger", entityId: ledger.id, action: "forfeit", after: { trancheIds: ids } }, tx);
  const released = ledger.tranches.filter((t) => t.status === "RELEASED");
  if (released.length) {
    const approvers = await usersWithPermission("commissions:adjust", tx);
    await notifyUsers(approvers, { title: "Released commission on a cancelled sale", body: `${released.length} tranche(s) were already released — consider a clawback adjustment.`, link: `/transactions/${transactionId}?tab=commission`, kind: "COMMISSION", dedupeKey: `clawback:${transactionId}` }, tx);
  }
}

export async function approveTranches(ids: string[], ctx: ActorCtx) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.commissionTranche.findMany({ where: { id: { in: ids } } });
    const bad = rows.filter((r) => r.status !== "DUE");
    if (bad.length || rows.length !== ids.length) throw new DomainError("Only DUE tranches can be approved.");
    await tx.commissionTranche.updateMany({ where: { id: { in: ids } }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    for (const r of rows) await audit(ctx, { entity: "CommissionTranche", entityId: r.id, action: "approve", before: { status: r.status }, after: { status: "APPROVED" } }, tx);
    return rows.length;
  });
}

export async function releaseTranches(ids: string[], reference: string, ctx: ActorCtx) {
  if (!reference) throw new DomainError("Enter the check or voucher number.");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.commissionTranche.findMany({ where: { id: { in: ids } }, include: { ledger: true } });
    if (rows.some((r) => r.status !== "APPROVED") || rows.length !== ids.length) throw new DomainError("Only APPROVED tranches can be released.");
    await tx.commissionTranche.updateMany({ where: { id: { in: ids } }, data: { status: "RELEASED", releasedAt: new Date(), releasedById: ctx.userId, releaseReference: reference } });
    for (const r of rows) {
      await audit(ctx, { entity: "CommissionTranche", entityId: r.id, action: "release", before: { status: r.status }, after: { status: "RELEASED", reference } }, tx);
      await logActivity({ type: "SYSTEM", subject: `Commission released: ${r.label} ${formatPeso(r.amountCents)} (ref ${reference})`, transactionId: r.ledger.transactionId, brokerId: r.ledger.brokerId, actorId: ctx.userId }, tx);
    }
    return rows.length;
  });
}

export async function addAdjustment(ledgerId: string, amountCents: number, reason: string, ctx: ActorCtx) {
  const a = await prisma.commissionAdjustment.create({ data: { ledgerId, amountCents: BigInt(amountCents), reason, createdById: ctx.userId } });
  await audit(ctx, { entity: "CommissionLedger", entityId: ledgerId, action: amountCents < 0 ? "clawback" : "adjustment", after: { amountCents, reason } });
  return a;
}
