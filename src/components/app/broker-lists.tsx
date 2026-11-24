import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge, EmptyState } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { label } from "@/lib/labels";
import { formatDateTime, formatDay } from "@/lib/format";
import { formatPeso } from "@/lib/money";
import { fullName } from "@/lib/utils";

export async function BrokerLeads({ brokerId }: { brokerId: string }) {
  const leads = await prisma.lead.findMany({ where: { brokerId, deletedAt: null }, include: { stage: true, owner: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Lead</TH>
            <TH>Stage</TH>
            <TH>Owner</TH>
            <TH>Last activity</TH>
          </TR>
        </THead>
        <TBody>
          {leads.map((l) => (
            <TR key={l.id}>
              <TD>
                <Link href={`/pipeline/leads/${l.id}`} className="font-medium text-brand-800 hover:underline">
                  {fullName(l)}
                </Link>
              </TD>
              <TD>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.stage.color }} />
                  {l.stage.name}
                </span>
              </TD>
              <TD className="text-xs">{l.owner?.name ?? "—"}</TD>
              <TD className="text-xs">{formatDateTime(l.lastActivityAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {leads.length === 0 && <EmptyState title="No leads" />}
    </Card>
  );
}

export async function BrokerTransactions({ where }: { where: { brokerId?: string; brokerageId?: string } }) {
  const txs = await prisma.transaction.findMany({ where: { ...where, deletedAt: null }, include: { client: true, items: { include: { unit: true, parkingSlot: true } }, broker: true }, orderBy: { reservedAt: "desc" }, take: 200 });
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Transaction</TH>
            <TH>Buyer</TH>
            <TH>Items</TH>
            <TH>Broker</TH>
            <TH>Status</TH>
            <TH className="text-right">TCP</TH>
          </TR>
        </THead>
        <TBody>
          {txs.map((t) => (
            <TR key={t.id}>
              <TD>
                <Link href={`/transactions/${t.id}`} className="font-medium text-brand-800 hover:underline">
                  {t.code}
                </Link>
                <div className="text-xs text-muted-foreground">{formatDay(t.reservedAt)}</div>
              </TD>
              <TD>{fullName(t.client)}</TD>
              <TD className="text-xs">{t.items.map((i) => i.unit?.code ?? i.parkingSlot?.code).join(", ")}</TD>
              <TD className="text-xs">{t.broker ? fullName(t.broker) : "—"}</TD>
              <TD>
                <StatusBadge status={t.status} label={label(t.status)} />
              </TD>
              <TD className="text-right tabular">{formatPeso(t.tcpCents)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {txs.length === 0 && <EmptyState title="No transactions" />}
    </Card>
  );
}

export async function BrokerCommissions({ where }: { where: { brokerId?: string; brokerageId?: string } }) {
  const tranches = await prisma.commissionTranche.findMany({ where: { ledger: where }, include: { ledger: { include: { transaction: { select: { id: true, code: true } } } } }, orderBy: [{ ledger: { createdAt: "desc" } }, { seq: "asc" }], take: 300 });
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Transaction</TH>
            <TH>Tranche</TH>
            <TH>Status</TH>
            <TH className="text-right">Brokerage share</TH>
            <TH className="text-right">Agent share</TH>
            <TH className="text-right">Total</TH>
          </TR>
        </THead>
        <TBody>
          {tranches.map((t) => (
            <TR key={t.id}>
              <TD>
                <Link className="text-brand-800 hover:underline" href={`/transactions/${t.ledger.transaction.id}?tab=commission`}>
                  {t.ledger.transaction.code}
                </Link>
              </TD>
              <TD className="text-xs">{t.label}</TD>
              <TD>
                <StatusBadge status={t.status} />
              </TD>
              <TD className="text-right tabular">{formatPeso(t.brokerageAmountCents)}</TD>
              <TD className="text-right tabular">{formatPeso(t.agentAmountCents)}</TD>
              <TD className="text-right tabular">{formatPeso(t.amountCents)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {tranches.length === 0 && <EmptyState title="No commissions yet" />}
    </Card>
  );
}
