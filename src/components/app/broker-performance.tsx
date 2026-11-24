import { prisma } from "@/lib/db";
import { StatCard } from "./page";
import { formatPeso, n } from "@/lib/money";
import { formatPct } from "@/lib/format";

/** Pipeline, sales, cancellations, commission totals for a broker or a brokerage. */
export async function BrokerPerformance({ brokerId, brokerageId }: { brokerId?: string; brokerageId?: string }) {
  const by = brokerId ? { brokerId } : { brokerageId };
  const [openLeads, wonLeads, allLeads, active, cancelled, ledgers] = await Promise.all([
    prisma.lead.count({ where: { ...by, deletedAt: null, stage: { isWon: false, isLost: false } } }),
    prisma.lead.count({ where: { ...by, deletedAt: null, stage: { isWon: true } } }),
    prisma.lead.count({ where: { ...by, deletedAt: null } }),
    prisma.transaction.aggregate({ where: { ...by, deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED"] } }, _count: true, _sum: { tcpCents: true } }),
    prisma.transaction.count({ where: { ...by, deletedAt: null, status: "CANCELLED" } }),
    prisma.commissionTranche.groupBy({ by: ["status"], where: { ledger: by }, _sum: { amountCents: true } }),
  ]);
  const comm = Object.fromEntries(ledgers.map((l) => [l.status, n(l._sum.amountCents)]));
  const total = active._count + cancelled;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Open pipeline" value={openLeads} sub={`${allLeads} leads total`} />
      <StatCard label="Sales (active)" value={active._count} sub={formatPeso(active._sum.tcpCents ?? 0n) + " TCP"} />
      <StatCard label="Cancellations" value={cancelled} sub={total ? `${formatPct((cancelled / total) * 100)} cancellation rate` : undefined} tone={cancelled ? "warn" : undefined} />
      <StatCard label="Conversion" value={allLeads ? formatPct((wonLeads / allLeads) * 100) : "—"} sub="leads → reservation" />
      <StatCard label="Commission earned" value={formatPeso(Object.values(comm).reduce((a, b) => a + b, 0) - (comm.FORFEITED ?? 0))} />
      <StatCard label="Due / approved" value={formatPeso((comm.DUE ?? 0) + (comm.APPROVED ?? 0))} />
      <StatCard label="Released" value={formatPeso(comm.RELEASED ?? 0)} />
      <StatCard label="Forfeited" value={formatPeso(comm.FORFEITED ?? 0)} />
    </div>
  );
}
