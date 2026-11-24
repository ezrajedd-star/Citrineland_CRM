import Link from "next/link";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DL, EmptyState, StatusBadge } from "@/components/app/page";
import { FormDialog } from "@/components/app/form-dialog";
import { TrancheActions } from "@/components/commissions/tranche-actions";
import { adjust } from "@/server/actions/commissions";
import { formatPeso } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { fullName } from "@/lib/utils";

export async function CommissionLedgerPanel({ transactionId, user }: { transactionId: string; user: CurrentUser }) {
  if (!can(user, "commissions:view")) return <EmptyState title="You can't view commissions" />;
  const l = await prisma.commissionLedger.findUnique({ where: { transactionId }, include: { tranches: { orderBy: { seq: "asc" } }, adjustments: { orderBy: { createdAt: "desc" } }, broker: true, brokerage: true } });
  if (!l) return <EmptyState title="No commission ledger" description="Direct sales (no broker of record) don't earn broker commission." />;
  const rs = l.ruleSnapshot as any;
  const adjTotal = l.adjustments.reduce((a, x) => a + x.amountCents, 0n);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <DL
            cols={4}
            items={[
              ["Broker", l.broker ? <Link key="b" href={`/brokers/${l.broker.id}`} className="text-brand-800 hover:underline">{fullName(l.broker)}</Link> : "—"],
              ["Brokerage", l.brokerage?.name ?? "Independent"],
              ["Rule", rs?.rule?.name ?? "Default (no rule matched)"],
              ["Rate / basis", `${l.ratePct}% of ${l.basis === "NSP" ? "net selling price" : "TCP"} (${formatPeso(l.basisCents)})`],
              ["Earned", <b key="e">{formatPeso(l.earnedCents)}</b>],
              ["Brokerage share", formatPeso(l.brokerageShareCents)],
              ["Agent share", formatPeso(l.agentShareCents)],
              ["Adjustments", formatPeso(adjTotal)],
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Release tranches</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Tranche & milestone</TH>
              <TH>Status</TH>
              <TH className="text-right">Brokerage</TH>
              <TH className="text-right">Agent</TH>
              <TH className="text-right">Amount</TH>
              <TH>Dates</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {l.tranches.map((t) => (
              <TR key={t.id}>
                <TD>{t.seq}</TD>
                <TD className="text-xs">{t.label}</TD>
                <TD>
                  <StatusBadge status={t.status} />
                </TD>
                <TD className="text-right tabular">{formatPeso(t.brokerageAmountCents)}</TD>
                <TD className="text-right tabular">{formatPeso(t.agentAmountCents)}</TD>
                <TD className="text-right tabular">{formatPeso(t.amountCents)}</TD>
                <TD className="text-xs text-muted-foreground">
                  {t.dueAt && <div>Due {formatDateTime(t.dueAt)}</div>}
                  {t.approvedAt && <div>Approved {formatDateTime(t.approvedAt)}</div>}
                  {t.releasedAt && <div>Released {formatDateTime(t.releasedAt)} · ref {t.releaseReference}</div>}
                  {t.forfeitedAt && <div>Forfeited {formatDateTime(t.forfeitedAt)}</div>}
                </TD>
                <TD className="text-right">
                  <TrancheActions ids={[t.id]} status={t.status} canApprove={can(user, "commissions:approve")} canRelease={can(user, "commissions:release")} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-semibold">Adjustments & clawbacks</span>
          {can(user, "commissions:adjust") && (
            <FormDialog
              title="Commission adjustment"
              description="Use a negative amount for a clawback of released commission."
              triggerLabel="Add adjustment"
              triggerVariant="outline"
              schema="commissionAdjustment"
              columns={1}
              action={adjust}
              defaultValues={{ ledgerId: l.id }}
              fields={[
                { name: "ledgerId", label: "", type: "hidden" },
                { name: "amount", label: "Amount (₱, negative = clawback)", type: "number", required: true },
                { name: "reason", label: "Reason", type: "textarea", required: true },
              ]}
            />
          )}
        </div>
        <Table>
          <TBody>
            {l.adjustments.map((a) => (
              <TR key={a.id}>
                <TD className="text-xs">{formatDateTime(a.createdAt)}</TD>
                <TD className="text-right tabular">{formatPeso(a.amountCents)}</TD>
                <TD className="text-xs">{a.reason}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {l.adjustments.length === 0 && <div className="p-3 text-xs text-muted-foreground">None.</div>}
      </Card>
    </div>
  );
}
