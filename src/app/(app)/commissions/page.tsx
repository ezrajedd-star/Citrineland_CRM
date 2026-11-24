import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, LinkTabs, StatCard, EmptyState, Pagination } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { TrancheTable } from "@/components/commissions/tranche-table";
import { ReportTableView, ExportButtons } from "@/components/app/report-table";
import { commissionsPayable } from "@/server/reports/commissions";
import { parseReportFilters } from "@/server/reports/filters";
import { brokerageOptions, brokerOptions, developmentOptions } from "@/server/queries/options";
import { formatPeso, n } from "@/lib/money";
import { formatDay } from "@/lib/format";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Commissions" };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("commissions:view");
  const params = await searchParams;
  const tab = sp(params, "tab") ?? sp(params, "status") ?? "DUE";
  const [brokerages, brokers, devs, totals] = await Promise.all([
    brokerageOptions(),
    brokerOptions(),
    developmentOptions(),
    prisma.commissionTranche.groupBy({ by: ["status"], _sum: { amountCents: true }, _count: true }),
  ]);
  const tot = Object.fromEntries(totals.map((t) => [t.status, { amt: n(t._sum.amountCents), count: t._count }]));
  const filters = (
    <FilterBar
      basePath="/commissions"
      values={params}
      extra={<input type="hidden" name="tab" value={tab} />}
      filters={[
        { type: "select", name: "brokerageId", label: "Brokerage", options: brokerages },
        { type: "select", name: "brokerId", label: "Broker", options: brokers },
        { type: "select", name: "developmentId", label: "Development", options: devs },
        ...(tab === "payable" || tab === "RELEASED" ? [{ type: "date" as const, name: "from", label: "From" }, { type: "date" as const, name: "to", label: "To" }] : []),
      ]}
    />
  );
  const header = (
    <>
      <PageHeader title="Commissions" description="Tranches become due automatically when collections reach their milestone. Approve, then record release with the check/voucher number." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(["NOT_DUE", "DUE", "APPROVED", "RELEASED", "FORFEITED"] as const).map((s) => (
          <StatCard key={s} label={s.replace("_", " ").toLowerCase()} value={formatPeso(tot[s]?.amt ?? 0)} sub={`${tot[s]?.count ?? 0} tranche(s)`} href={`/commissions?tab=${s}`} tone={s === "DUE" && tot[s]?.count ? "warn" : undefined} />
        ))}
      </div>
      <LinkTabs
        baseHref="/commissions"
        active={tab}
        tabs={[
          { key: "DUE", label: "Due", count: tot.DUE?.count ?? 0 },
          { key: "APPROVED", label: "Approved", count: tot.APPROVED?.count ?? 0 },
          { key: "RELEASED", label: "Released" },
          { key: "NOT_DUE", label: "Not yet due" },
          { key: "FORFEITED", label: "Forfeited" },
          { key: "payable", label: "Payable report" },
        ]}
      />
    </>
  );

  if (tab === "payable") {
    const f = parseReportFilters(params);
    const table = await commissionsPayable(f);
    return (
      <>
        {header}
        <Card>
          {filters}
          <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
            <span>
              Outstanding (due + approved) by broker; released totals for {formatDay(f.from)} – {formatDay(f.to)}.
            </span>
            {can(user, "reports:export") && <ExportButtons report="commissions-payable" searchParams={params} />}
          </div>
          <ReportTableView table={table} />
        </Card>
      </>
    );
  }

  const { page, pageSize, skip, take } = pageParams(params, 50);
  const where: Prisma.CommissionTrancheWhereInput = {
    status: tab as any,
    ledger: {
      ...(sp(params, "brokerageId") ? { brokerageId: sp(params, "brokerageId") } : {}),
      ...(sp(params, "brokerId") ? { brokerId: sp(params, "brokerId") } : {}),
      ...(sp(params, "developmentId") ? { transaction: { developmentId: sp(params, "developmentId") } } : {}),
    },
  };
  const [rows, total] = await Promise.all([
    prisma.commissionTranche.findMany({ where, include: { ledger: { include: { broker: true, brokerage: true, transaction: { include: { client: true } } } } }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }], skip, take }),
    prisma.commissionTranche.count({ where }),
  ]);
  return (
    <>
      {header}
      <Card>
        {filters}
        {rows.length === 0 ? (
          <EmptyState title="Nothing here" />
        ) : (
          <TrancheTable
            canApprove={can(user, "commissions:approve")}
            canRelease={can(user, "commissions:release")}
            rows={rows.map((t) => ({
              id: t.id,
              status: t.status,
              label: t.label,
              txId: t.ledger.transactionId,
              txCode: t.ledger.transaction.code,
              client: fullName(t.ledger.transaction.client),
              broker: t.ledger.broker ? fullName(t.ledger.broker) : "—",
              brokerage: t.ledger.brokerage?.name ?? "Independent",
              amountCents: n(t.amountCents),
              brokerageAmountCents: n(t.brokerageAmountCents),
              agentAmountCents: n(t.agentAmountCents),
              date: formatDay(t.releasedAt ?? t.approvedAt ?? t.dueAt ?? t.forfeitedAt ?? t.createdAt) + (t.releaseReference ? ` · ${t.releaseReference}` : ""),
            }))}
          />
        )}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/commissions" />
      </Card>
    </>
  );
}
