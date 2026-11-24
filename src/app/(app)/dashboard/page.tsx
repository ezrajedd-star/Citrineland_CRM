import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TR, TD } from "@/components/ui/table";
import { Chart } from "@/components/charts/chart";
import { ExpiryBadge } from "@/components/app/expiry";
import { TasksPanel } from "@/components/app/tasks-panel";
import { funnelReport, brokerReport, inventoryReport, marketingReport } from "@/server/reports/core";
import { formatPeso, formatPesoCompact, n } from "@/lib/money";
import { formatPct, manilaToday, formatDateTime, formatDay } from "@/lib/format";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function monthRange() {
  const t = manilaToday();
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const to = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - 1);
  return { from, to };
}
function ytd() {
  const t = manilaToday();
  return { from: new Date(Date.UTC(t.getUTCFullYear(), 0, 1)), to: new Date(t.getTime() + 86_400_000 - 1) };
}

export default async function Dashboard() {
  const user = await requireUser();
  const isAdmin = user.roleKey === "ADMIN";
  const show = {
    sales: isAdmin || user.roleKey === "SALES_MANAGER" || (!user.roleKey?.match(/MARKETING|BNG/) && can(user, "reports:view_sales")),
    marketing: isAdmin || user.roleKey === "MARKETING_MANAGER" || (!user.roleKey?.match(/SALES|BNG/) && can(user, "reports:view_marketing")),
    bng: isAdmin || user.roleKey === "BNG_STAFF" || (!user.roleKey?.match(/SALES|MARKETING/) && can(user, "brokers:update")),
    system: isAdmin,
  };
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description={`${user.roleName} · ${formatDay(manilaToday())}`} />
      <div className="space-y-8">
        {show.system && <SystemHealth />}
        {show.sales && <SalesSection />}
        {show.marketing && <MarketingSection />}
        {show.bng && <BngSection user={user} />}
        {!show.bng && (
          <Section title="My tasks">
            <Card>
              <CardContent className="pt-4">
                <TasksPanel filter={{ assigneeId: user.id }} showRelated limit={8} />
              </CardContent>
            </Card>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

async function SystemHealth() {
  const [hb, failed, conns, users] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "worker.heartbeat" } }),
    prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM pgboss.job WHERE state = 'failed'`).catch(() => [{ n: 0n }]),
    prisma.microsoftConnection.groupBy({ by: ["status"], _count: true }),
    prisma.user.count({ where: { status: "ACTIVE", deletedAt: null, type: "STAFF" } }),
  ]);
  const at = hb ? new Date(String((hb.value as any).at)) : null;
  const healthy = at && Date.now() - at.getTime() < 5 * 60_000;
  const c = Object.fromEntries(conns.map((x) => [x.status, x._count]));
  return (
    <Section title="System health">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Worker" value={healthy ? "Running" : "Down"} tone={healthy ? "good" : "danger"} sub={at ? `heartbeat ${formatDateTime(at)}` : "no heartbeat"} href="/admin/jobs" />
        <StatCard label="Failed jobs" value={Number(failed[0]?.n ?? 0)} tone={Number(failed[0]?.n ?? 0) ? "danger" : "good"} href="/admin/jobs" />
        <StatCard label="Microsoft 365 connected" value={`${c.CONNECTED ?? 0} / ${users}`} tone={c.ERROR ? "warn" : undefined} sub={c.ERROR ? `${c.ERROR} with errors` : "Graph connection status"} href="/admin/integrations" />
        <StatCard label="Active users" value={users} href="/admin/users" />
      </div>
    </Section>
  );
}

async function SalesSection() {
  const m = monthRange();
  const y = ytd();
  const active = { status: { notIn: ["CANCELLED", "TRANSFERRED"] as any } };
  const [mtd, mtdAll, cancelledMtd, quota, docsOverdue, dueTranches, funnel, brokers, inv] = await Promise.all([
    prisma.transaction.aggregate({ where: { deletedAt: null, reservedAt: { gte: m.from, lte: m.to }, ...active }, _count: true, _sum: { tcpCents: true } }),
    prisma.transaction.count({ where: { deletedAt: null, reservedAt: { gte: m.from, lte: m.to } } }),
    prisma.transaction.count({ where: { deletedAt: null, cancelledAt: { gte: m.from, lte: m.to } } }),
    prisma.quota.aggregate({ where: { targetType: "STAFF", periodType: "MONTH", periodStart: m.from }, _sum: { units: true, valueCents: true } }),
    prisma.transactionDocument.count({ where: { required: true, status: { in: ["PENDING", "REJECTED"] }, dueDate: { lt: manilaToday() }, transaction: { ...active, deletedAt: null } } }),
    prisma.commissionTranche.aggregate({ where: { status: "DUE" }, _count: true, _sum: { amountCents: true } }),
    funnelReport(y),
    brokerReport(y),
    inventoryReport(y),
  ]);
  const qUnits = quota._sum.units ?? 0;
  const qValue = n(quota._sum.valueCents);
  const tcp = n(mtd._sum.tcpCents);
  return (
    <Section title="Sales" description="This month, and year-to-date pipeline">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Reservations (MTD)" value={mtdAll} sub={qUnits ? `quota ${qUnits} · ${formatPct((mtd._count / qUnits) * 100)} net` : "no quota set"} href="/transactions" />
        <StatCard label="Net sales (MTD)" value={mtd._count} sub="excl. cancellations" />
        <StatCard label="TCP booked (MTD)" value={formatPesoCompact(tcp)} sub={qValue ? `${formatPct((tcp / qValue) * 100)} of ${formatPesoCompact(qValue)} quota` : formatPeso(tcp)} />
        <StatCard label="Cancellations (MTD)" value={cancelledMtd} tone={cancelledMtd ? "warn" : undefined} href="/transactions?status=CANCELLED" />
        <StatCard label="Documents overdue" value={docsOverdue} tone={docsOverdue ? "danger" : "good"} href="/tasks" />
        <StatCard label="Commissions due" value={formatPesoCompact(n(dueTranches._sum.amountCents))} sub={`${dueTranches._count} tranche(s) to approve`} tone={dueTranches._count ? "warn" : undefined} href="/commissions?tab=DUE" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Conversion funnel (YTD leads)</CardTitle>
            <CardDescription>{funnel.note}</CardDescription>
          </CardHeader>
          <CardContent>{funnel.charts?.[0] && <Chart spec={funnel.charts[0].spec} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top brokers (YTD sales value)</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {brokers.tables[0].rows.slice(0, 6).map((r: any) => (
                <TR key={r.rank}>
                  <TD className="w-6 text-xs text-muted-foreground">{r.rank}</TD>
                  <TD className="text-sm">
                    {r.broker}
                    <div className="text-xs text-muted-foreground">{r.brokerage}</div>
                  </TD>
                  <TD className="text-right text-xs tabular">{r.reservations} res.</TD>
                  <TD className="text-right tabular">{formatPesoCompact(r.salesValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {brokers.tables[0].rows.length === 0 && <EmptyState title="No broker sales yet" />}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventory by development</CardTitle>
          </CardHeader>
          <CardContent>{inv.charts?.[0] && <Chart spec={inv.charts[0].spec} height={220} />}</CardContent>
        </Card>
      </div>
    </Section>
  );
}

async function MarketingSection() {
  const m = monthRange();
  const y = ytd();
  const [mtd, stale, report] = await Promise.all([
    prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: m.from, lte: m.to } } }),
    prisma.lead.findMany({ where: { deletedAt: null, stage: { isWon: false, isLost: false }, lastActivityAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, include: { stage: true, owner: { select: { name: true } } }, orderBy: { lastActivityAt: "asc" }, take: 6 }),
    marketingReport(y),
  ]);
  const staleCount = await prisma.lead.count({ where: { deletedAt: null, stage: { isWon: false, isLost: false }, lastActivityAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  const [sources, campaigns, seqs] = report.tables;
  const totalLeads = sources.rows.reduce((a: number, r: any) => a + r.leads, 0);
  const totalRes = sources.rows.reduce((a: number, r: any) => a + r.reservations, 0);
  const spend = campaigns.rows.reduce((a: number, r: any) => a + r.budget, 0);
  const campLeads = campaigns.rows.reduce((a: number, r: any) => a + r.leads, 0);
  return (
    <Section title="Marketing" description="Year-to-date lead generation">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="New leads (MTD)" value={mtd} href="/pipeline?view=list" />
        <StatCard label="Leads (YTD)" value={totalLeads} />
        <StatCard label="Lead → reservation" value={totalLeads ? formatPct((totalRes / totalLeads) * 100) : "—"} sub={`${totalRes} reservations`} />
        <StatCard label="Cost per lead" value={campLeads ? formatPeso(Math.round(spend / campLeads)) : "—"} sub="campaign-attributed leads" href="/marketing" />
        <StatCard label="Stale leads" value={staleCount} sub="no activity 7+ days" tone={staleCount ? "warn" : "good"} href="/pipeline?view=list&minAge=7" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Leads by source (YTD)</CardTitle>
          </CardHeader>
          <CardContent>{report.charts?.[0] && <Chart spec={report.charts[0].spec} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Campaigns & sequences</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {campaigns.rows.slice(0, 4).map((r: any) => (
                <TR key={r.campaign}>
                  <TD className="text-sm">{r.campaign}</TD>
                  <TD className="text-right text-xs tabular">{r.leads} leads</TD>
                  <TD className="text-right text-xs tabular">{r.cpl != null ? `${formatPeso(r.cpl)}/lead` : "—"}</TD>
                </TR>
              ))}
              {seqs.rows.map((r: any) => (
                <TR key={r.sequence}>
                  <TD className="text-sm">{r.sequence}</TD>
                  <TD className="text-right text-xs tabular">{r.sent} sent</TD>
                  <TD className="text-right text-xs tabular">{r.replyRate != null ? `${formatPct(r.replyRate)} replied` : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stale leads</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {stale.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/pipeline/leads/${l.id}`} className="text-sm text-brand-800 hover:underline">
                      {fullName(l)}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {l.stage.name} · {l.owner?.name ?? "Unassigned"}
                    </div>
                  </TD>
                  <TD className="text-right text-xs text-muted-foreground">last {formatDay(l.lastActivityAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {stale.length === 0 && <EmptyState title="No stale leads" />}
        </Card>
      </div>
    </Section>
  );
}

async function BngSection({ user }: { user: CurrentUser }) {
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const [expiring, pendingBrokers, pendingFirms, backlog, backlogCount] = await Promise.all([
    prisma.broker.findMany({ where: { deletedAt: null, OR: [{ prcLicenseExpiry: { lte: soon } }, { accreditationExpiry: { lte: soon } }] }, include: { brokerage: { select: { name: true } } }, orderBy: { prcLicenseExpiry: "asc" }, take: 8 }),
    prisma.broker.count({ where: { deletedAt: null, accreditationStatus: "PENDING" } }),
    prisma.brokerage.count({ where: { deletedAt: null, accreditationStatus: "PENDING" } }),
    prisma.transaction.findMany({
      where: { deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED"] }, documents: { some: { required: true, status: { in: ["PENDING", "SUBMITTED", "REJECTED"] } } } },
      include: { client: true, documents: { where: { required: true, status: { in: ["PENDING", "SUBMITTED", "REJECTED"] } } } },
      orderBy: { reservedAt: "asc" },
      take: 8,
    }),
    prisma.transactionDocument.count({ where: { required: true, status: { in: ["PENDING", "SUBMITTED", "REJECTED"] }, transaction: { deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED"] } } } }),
  ]);
  return (
    <Section title="Broker network & documentation">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Expiring in 60 days" value={expiring.length} tone={expiring.length ? "warn" : "good"} sub="PRC license / accreditation" href="/brokers?expiring=license" />
        <StatCard label="Pending accreditation" value={pendingBrokers + pendingFirms} sub={`${pendingBrokers} brokers · ${pendingFirms} brokerages`} href="/brokers?status=PENDING" />
        <StatCard label="Documentation backlog" value={backlogCount} sub="required items not yet verified" tone={backlogCount ? "warn" : "good"} />
        <StatCard label="Awaiting verification" value={backlog.reduce((a, t) => a + t.documents.filter((d) => d.status === "SUBMITTED").length, 0)} sub="submitted, awaiting verification" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Expiring licenses & accreditations</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {expiring.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/brokers/${b.id}`} className="text-sm text-brand-800 hover:underline">
                      {fullName(b)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{b.brokerage?.name ?? "Independent"}</div>
                  </TD>
                  <TD className="text-right">
                    <ExpiryBadge date={b.prcLicenseExpiry} />
                  </TD>
                  <TD>
                    <StatusBadge status={b.accreditationStatus} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {expiring.length === 0 && <EmptyState title="Nothing expiring soon" />}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Documentation backlog</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {backlog.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/transactions/${t.id}?tab=documents`} className="text-sm text-brand-800 hover:underline">
                      {t.code}
                    </Link>
                    <div className="text-xs text-muted-foreground">{fullName(t.client)}</div>
                  </TD>
                  <TD className="text-right text-xs">{t.documents.length} open</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {backlog.length === 0 && <EmptyState title="All caught up" />}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <TasksPanel filter={{ assigneeId: user.id }} showRelated limit={8} />
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
