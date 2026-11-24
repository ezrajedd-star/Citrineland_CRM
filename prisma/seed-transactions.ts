import type { PrismaClient } from "@prisma/client";
import { createReservation, recordPayment, changeTransactionStatus, cancelTransaction } from "../src/server/transactions";
import { approveTranches, releaseTranches } from "../src/server/commissions";
import type { TxStatus } from "../src/domain/transactions/state-machine";

const DAY = 86_400_000;
function daysAgo(n: number) {
  const d = new Date(Date.now() - n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface Plan {
  unit?: string;
  slots?: string[];
  scheme: string;
  daysAgo: number;
  /** Number of schedule lines (after the reservation fee) to pay */
  pay: number;
  path: TxStatus[];
  cancel?: string;
  approve?: boolean;
  release?: boolean;
  dev: "CTR" | "AMB";
  lead?: string;
}

export async function seedTransactions(prisma: PrismaClient, userIds: Record<string, string>) {
  if ((await prisma.transaction.count()) > 0) {
    console.log("Transactions already present — skipping.");
    return;
  }
  console.log("Seeding commission rules and transactions…");
  process.env.DISABLE_EVENTS = "true";
  const [ctr, amb] = await Promise.all([prisma.development.findUniqueOrThrow({ where: { code: "CTR" } }), prisma.development.findUniqueOrThrow({ where: { code: "AMB" } })]);
  const golden = await prisma.brokerage.findFirst({ where: { name: { startsWith: "Golden Key" } } });
  await prisma.commissionRule.create({
    data: {
      name: "Standard — 5% of NSP",
      ratePct: 5,
      basis: "NSP",
      brokerageSharePct: 40,
      agentSharePct: 60,
      tranches: [
        { label: "50% upon 20% of TCP collected", pct: 50, milestoneType: "COLLECTED_PCT_TCP", milestoneValue: 20 },
        { label: "50% upon full down payment", pct: 50, milestoneType: "DP_COMPLETE", milestoneValue: null },
      ],
      createdById: userIds.ADMIN,
    },
  });
  if (golden)
    await prisma.commissionRule.create({
      data: {
        name: "Golden Key × Amberfield — 4.5%",
        developmentId: amb.id,
        brokerageId: golden.id,
        ratePct: 4.5,
        basis: "NSP",
        brokerageSharePct: 30,
        agentSharePct: 70,
        tranches: [
          { label: "30% on Contract to Sell", pct: 30, milestoneType: "CONTRACT_SIGNED", milestoneValue: null },
          { label: "70% upon full down payment", pct: 70, milestoneType: "DP_COMPLETE", milestoneValue: null },
        ],
        createdById: userIds.ADMIN,
      },
    });

  const schemes = await prisma.paymentScheme.findMany();
  const scheme = (name: string) => schemes.find((s) => s.name.startsWith(name))!.id;
  const plans: Plan[] = [
    { dev: "CTR", unit: "TA-305", scheme: "20% DP over 36", daysAgo: 5, pay: 0, path: [] },
    { dev: "CTR", unit: "TA-404", scheme: "20% DP over 36", daysAgo: 25, pay: 0, path: ["DOCUMENTATION"] },
    { dev: "CTR", unit: "TA-604", slots: ["B1-005"], scheme: "20% DP over 36", daysAgo: 70, pay: 2, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS"] },
    { dev: "CTR", unit: "TA-805", scheme: "10% spot DP", daysAgo: 120, pay: 1, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS", "DOWNPAYMENT_COMPLETE", "FOR_LOAN_TAKEOUT"], approve: true },
    { dev: "CTR", unit: "TA-901", slots: ["B1-012"], scheme: "Spot cash", daysAgo: 200, pay: 1, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "FULLY_PAID", "TURNED_OVER"], approve: true, release: true },
    { dev: "AMB", unit: "B1-L01", scheme: "20% DP over 12 months, in-house", daysAgo: 430, pay: 15, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS", "DOWNPAYMENT_COMPLETE", "BALANCE_IN_PROGRESS"], approve: true },
    { dev: "AMB", unit: "B2-L07", scheme: "15% DP over 24 months, Pag-IBIG", daysAgo: 190, pay: 3, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS"] },
    { dev: "AMB", unit: "B3-L12", scheme: "15% DP over 24 months, Pag-IBIG", daysAgo: 150, pay: 2, path: ["DOCUMENTATION"], cancel: "Buyer relocated abroad; requested cancellation (demo)" },
    { dev: "CTR", unit: "TA-1002", scheme: "Deferred cash, 36 months", daysAgo: 400, pay: 13, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "BALANCE_IN_PROGRESS"] },
    { dev: "AMB", unit: "B4-L05", scheme: "20% DP over 12 months, in-house", daysAgo: 45, pay: 1, path: ["DOCUMENTATION", "CONTRACT_SIGNED", "DOWNPAYMENT_IN_PROGRESS"] },
  ];
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, stage: { isWon: false, isLost: false }, clientId: null, OR: [{ brokerId: null }, { broker: { accreditationStatus: "ACCREDITED" } }] },
    orderBy: { createdAt: "asc" },
  });
  const accredited = await prisma.broker.findMany({ where: { accreditationStatus: "ACCREDITED" }, orderBy: { lastName: "asc" } });
  const ctx = { userId: userIds.SALES_MANAGER, ip: null };
  let i = 0;
  for (const p of plans) {
    const lead = leads[i++];
    const devId = p.dev === "CTR" ? ctr.id : amb.id;
    const unit = p.unit ? await prisma.unit.findFirstOrThrow({ where: { developmentId: devId, code: p.unit } }) : null;
    const slots = p.slots ? await prisma.parkingSlot.findMany({ where: { developmentId: devId, code: { in: p.slots } } }) : [];
    const resDate = daysAgo(p.daysAgo);
    const t = await createReservation(
      { leadId: lead.id, brokerId: i === 2 ? null : (lead.brokerId ?? accredited[i % accredited.length].id), unitId: unit?.id, parkingSlotIds: slots.map((s) => s.id), paymentSchemeId: scheme(p.scheme), reservationDate: resDate, reservationFeePaid: true, orNumber: `OR-DEMO-${i}-00`, paymentMethod: "CASH" },
      ctx,
    );
    await prisma.transaction.update({ where: { id: t.id }, data: { createdAt: resDate } });
    const lines = await prisma.scheduleItem.findMany({ where: { transactionId: t.id, kind: { not: "RESERVATION" } }, orderBy: { seq: "asc" } });
    for (const [k, line] of lines.slice(0, p.pay).entries()) {
      if (line.dueDate.getTime() > Date.now()) break;
      await recordPayment({ transactionId: t.id, paidAt: line.dueDate, amountCents: Number(line.amountCents), method: k % 2 ? "PDC" : "BANK_TRANSFER", orNumber: `OR-DEMO-${i}-${String(k + 1).padStart(2, "0")}` }, ctx);
    }
    for (const [k, s] of p.path.entries()) {
      await changeTransactionStatus({ transactionId: t.id, toStatus: s, effectiveDate: new Date(resDate.getTime() + (k + 1) * 10 * DAY) }, ctx);
    }
    if (p.cancel) await cancelTransaction({ transactionId: t.id, reason: p.cancel }, ctx);
    if (p.approve) {
      const due = await prisma.commissionTranche.findMany({ where: { ledger: { transactionId: t.id }, status: "DUE" } });
      if (due.length) await approveTranches(due.map((d) => d.id), { userId: userIds.SALES_MANAGER, ip: null });
      if (p.release && due.length) await releaseTranches([due[0].id], `CV-DEMO-${2000 + i}`, { userId: userIds.ADMIN, ip: null });
    }
  }
}
