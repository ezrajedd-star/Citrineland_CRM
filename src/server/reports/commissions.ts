import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";
import type { ReportTable } from "../export";
import type { ReportFilters } from "./filters";

/** Commissions payable: due/approved (and released in period) grouped by brokerage and broker. */
export async function commissionsPayable(f: ReportFilters): Promise<ReportTable> {
  const where: Prisma.CommissionTrancheWhereInput = {
    ledger: {
      ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}),
      ...(f.brokerId ? { brokerId: f.brokerId } : {}),
      transaction: { ...(f.developmentId ? { developmentId: f.developmentId } : {}), ...(f.staffId ? { handlingStaffId: f.staffId } : {}) },
    },
    OR: [{ status: { in: ["DUE", "APPROVED"] } }, { status: "RELEASED", releasedAt: { gte: f.from, lte: f.to } }],
  };
  const rows = await prisma.commissionTranche.findMany({ where, include: { ledger: { include: { broker: true, brokerage: true, transaction: { select: { code: true } } } } } });
  const groups = new Map<string, any>();
  for (const t of rows) {
    const key = `${t.ledger.brokerageId ?? "-"}|${t.ledger.brokerId ?? "-"}`;
    const g = groups.get(key) ?? { brokerage: t.ledger.brokerage?.name ?? "Independent", broker: t.ledger.broker ? fullName(t.ledger.broker) : "—", due: 0, approved: 0, released: 0, brokerageShare: 0, agentShare: 0, transactions: new Set<string>() };
    const amt = Number(t.amountCents);
    if (t.status === "DUE") g.due += amt;
    if (t.status === "APPROVED") g.approved += amt;
    if (t.status === "RELEASED") g.released += amt;
    if (t.status !== "RELEASED") {
      g.brokerageShare += Number(t.brokerageAmountCents);
      g.agentShare += Number(t.agentAmountCents);
    }
    g.transactions.add(t.ledger.transaction.code);
    groups.set(key, g);
  }
  return {
    title: "Commissions payable",
    columns: [
      { key: "brokerage", label: "Brokerage" },
      { key: "broker", label: "Broker" },
      { key: "transactions", label: "Transactions" },
      { key: "due", label: "Due (unapproved)", type: "money" },
      { key: "approved", label: "Approved (payable)", type: "money" },
      { key: "brokerageShare", label: "Unpaid brokerage share", type: "money" },
      { key: "agentShare", label: "Unpaid agent share", type: "money" },
      { key: "released", label: "Released in period", type: "money" },
    ],
    rows: [...groups.values()].map((g) => ({ ...g, transactions: [...g.transactions].join(", ") })).sort((a, b) => b.approved + b.due - (a.approved + a.due)),
  };
}
