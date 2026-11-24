import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { label } from "@/lib/labels";
import { manilaToday } from "@/lib/format";
import { summarizeCollections } from "@/domain/payments/allocation";
import type { ReportTable } from "../export";
import type { ReportFilters } from "./filters";
import { commissionsPayable } from "./commissions";

/** A chart the reports page can draw: one x key, one or more numeric series (one y-axis). */
export interface ChartSpec {
  kind: "bar" | "line" | "hbar";
  x: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number>[];
  format?: "money" | "number" | "pct";
}
export interface ReportResult {
  tables: ReportTable[];
  charts?: { title: string; spec: ChartSpec }[];
  note?: string;
}

const ACTIVE: Prisma.TransactionWhereInput = { status: { notIn: ["CANCELLED", "TRANSFERRED"] } };
const monthKey = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 7); // Manila month
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

function txWhere(f: ReportFilters): Prisma.TransactionWhereInput {
  return {
    deletedAt: null,
    reservedAt: { gte: f.from, lte: f.to },
    ...(f.developmentId ? { developmentId: f.developmentId } : {}),
    ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}),
    ...(f.brokerId ? { brokerId: f.brokerId } : {}),
    ...(f.staffId ? { handlingStaffId: f.staffId } : {}),
  };
}
function leadWhere(f: ReportFilters): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    createdAt: { gte: f.from, lte: f.to },
    ...(f.developmentId ? { developments: { some: { id: f.developmentId } } } : {}),
    ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}),
    ...(f.brokerId ? { brokerId: f.brokerId } : {}),
    ...(f.staffId ? { ownerId: f.staffId } : {}),
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
  };
}

// ── Sales ──
export async function salesReport(f: ReportFilters): Promise<ReportResult> {
  const txs = await prisma.transaction.findMany({ where: txWhere(f), include: { development: { select: { name: true } }, items: { include: { unit: { select: { unitType: true } } } } } });
  const rows = new Map<string, any>();
  const months = new Map<string, any>();
  for (const t of txs) {
    const m = monthKey(t.reservedAt);
    const unitType = t.items.find((i) => i.unit)?.unit?.unitType ?? "PARKING";
    const key = `${m}|${t.development.name}|${unitType}`;
    const r = rows.get(key) ?? { month: m, development: t.development.name, unitType: label(unitType), reservations: 0, cancelled: 0, netSales: 0, tcpBooked: 0 };
    const mm = months.get(m) ?? { month: m, reservations: 0, netSales: 0, tcpBooked: 0 };
    r.reservations++;
    mm.reservations++;
    if (t.status === "CANCELLED") r.cancelled++;
    else if (t.status !== "TRANSFERRED") {
      r.netSales++;
      r.tcpBooked += n(t.tcpCents);
      mm.netSales++;
      mm.tcpBooked += n(t.tcpCents);
    }
    rows.set(key, r);
    months.set(m, mm);
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  return {
    tables: [
      {
        title: "Sales",
        columns: [
          { key: "month", label: "Month" },
          { key: "development", label: "Development" },
          { key: "unitType", label: "Unit type" },
          { key: "reservations", label: "Reservations", type: "number" },
          { key: "cancelled", label: "Cancelled", type: "number" },
          { key: "netSales", label: "Net sales (units)", type: "number" },
          { key: "tcpBooked", label: "TCP booked", type: "money" },
        ],
        rows: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month) || a.development.localeCompare(b.development)),
      },
    ],
    charts: [
      { title: "TCP booked by month (net of cancellations)", spec: { kind: "bar", x: "month", series: [{ key: "tcpBooked", label: "TCP booked" }], data: monthly, format: "money" } },
      { title: "Reservations vs net sales by month", spec: { kind: "bar", x: "month", series: [{ key: "reservations", label: "Reservations" }, { key: "netSales", label: "Net sales" }], data: monthly, format: "number" } },
    ],
  };
}

// ── Conversion funnel ──
export async function funnelReport(f: ReportFilters): Promise<ReportResult> {
  const [stages, leads, lostLabels] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.lead.findMany({ where: leadWhere(f), select: { id: true, stageId: true, lostReasonCode: true, stageHistory: { select: { toStageId: true, createdAt: true }, orderBy: { createdAt: "asc" } } } }),
    prisma.picklist.findMany({ where: { type: "LOST_REASON" } }),
  ]);
  const reached = new Map<string, number>();
  const durations = new Map<string, number[]>();
  const now = Date.now();
  for (const l of leads) {
    const seen = new Set(l.stageHistory.map((h) => h.toStageId));
    seen.add(l.stageId);
    for (const s of seen) reached.set(s, (reached.get(s) ?? 0) + 1);
    l.stageHistory.forEach((h, i) => {
      const end = l.stageHistory[i + 1]?.createdAt.getTime() ?? now;
      durations.set(h.toStageId, [...(durations.get(h.toStageId) ?? []), (end - h.createdAt.getTime()) / 86_400_000]);
    });
  }
  const funnelStages = stages.filter((s) => !s.isLost);
  const first = reached.get(funnelStages[0]?.id ?? "") ?? leads.length;
  const rows = funnelStages.map((s, i) => {
    const c = reached.get(s.id) ?? 0;
    const prev = i === 0 ? leads.length : (reached.get(funnelStages[i - 1].id) ?? 0);
    const d = durations.get(s.id) ?? [];
    return { stage: s.name, leads: c, fromPrevious: prev ? (c / prev) * 100 : null, fromFirst: first ? (c / first) * 100 : null, avgDays: s.isWon ? null : d.length ? d.reduce((a, b) => a + b, 0) / d.length : null };
  });
  const lostStage = stages.find((s) => s.isLost);
  const lost = new Map<string, number>();
  for (const l of leads) if (l.stageId === lostStage?.id) lost.set(l.lostReasonCode ?? "UNSPECIFIED", (lost.get(l.lostReasonCode ?? "UNSPECIFIED") ?? 0) + 1);
  const lostTotal = [...lost.values()].reduce((a, b) => a + b, 0);
  const lbl = new Map(lostLabels.map((p) => [p.code, p.label]));
  return {
    tables: [
      {
        title: "Conversion funnel",
        columns: [
          { key: "stage", label: "Stage" },
          { key: "leads", label: "Leads reaching stage", type: "number" },
          { key: "fromPrevious", label: "Conversion from previous %", type: "pct" },
          { key: "fromFirst", label: "Conversion from first %", type: "pct" },
          { key: "avgDays", label: "Avg days in stage", type: "number" },
        ],
        rows,
      },
      {
        title: "Lost reasons",
        columns: [
          { key: "reason", label: "Lost reason" },
          { key: "count", label: "Leads", type: "number" },
          { key: "share", label: "Share %", type: "pct" },
        ],
        rows: [...lost.entries()].map(([k, v]) => ({ reason: lbl.get(k) ?? k, count: v, share: (v / lostTotal) * 100 })).sort((a, b) => b.count - a.count),
      },
    ],
    charts: [{ title: "Leads reaching each stage", spec: { kind: "hbar", x: "stage", series: [{ key: "leads", label: "Leads" }], data: rows.map((r) => ({ stage: r.stage, leads: r.leads })), format: "number" } }],
    note: `${leads.length} leads created in the period.`,
  };
}

// ── Broker performance ──
export async function brokerReport(f: ReportFilters): Promise<ReportResult> {
  const [brokers, leads, txs] = await Promise.all([
    prisma.broker.findMany({ where: { deletedAt: null, ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}), ...(f.brokerId ? { id: f.brokerId } : {}) }, include: { brokerage: { select: { name: true } } } }),
    prisma.lead.groupBy({ by: ["brokerId"], where: { ...leadWhere(f), brokerId: { not: null } }, _count: true }),
    prisma.transaction.findMany({ where: { ...txWhere(f), brokerId: { not: null } }, select: { brokerId: true, status: true, tcpCents: true } }),
  ]);
  const leadsBy = new Map(leads.map((l) => [l.brokerId, l._count]));
  const rows = brokers
    .map((b) => {
      const t = txs.filter((x) => x.brokerId === b.id);
      const cancelled = t.filter((x) => x.status === "CANCELLED").length;
      const active = t.filter((x) => x.status !== "CANCELLED" && x.status !== "TRANSFERRED");
      const lc = leadsBy.get(b.id) ?? 0;
      return {
        broker: fullName(b),
        brokerage: b.brokerage?.name ?? "Independent",
        leads: lc,
        reservations: t.length,
        salesValue: active.reduce((a, x) => a + n(x.tcpCents), 0),
        cancellations: cancelled,
        cancellationRate: t.length ? (cancelled / t.length) * 100 : null,
        conversionRate: lc ? (t.length / lc) * 100 : null,
      };
    })
    .filter((r) => r.leads || r.reservations)
    .sort((a, b) => b.salesValue - a.salesValue || b.reservations - a.reservations)
    .map((r, i) => ({ rank: i + 1, ...r }));
  return {
    tables: [
      {
        title: "Broker performance",
        columns: [
          { key: "rank", label: "Rank", type: "number" },
          { key: "broker", label: "Broker" },
          { key: "brokerage", label: "Brokerage" },
          { key: "leads", label: "Leads", type: "number" },
          { key: "reservations", label: "Reservations", type: "number" },
          { key: "salesValue", label: "Sales value (TCP)", type: "money" },
          { key: "cancellations", label: "Cancellations", type: "number" },
          { key: "cancellationRate", label: "Cancellation rate %", type: "pct" },
          { key: "conversionRate", label: "Lead → reservation %", type: "pct" },
        ],
        rows,
      },
    ],
    charts: [{ title: "Top brokers by sales value", spec: { kind: "hbar", x: "broker", series: [{ key: "salesValue", label: "Sales value" }], data: rows.slice(0, 10).map((r) => ({ broker: r.broker, salesValue: r.salesValue })), format: "money" } }],
  };
}

// ── Quota vs actual ──
export async function quotaReport(f: ReportFilters): Promise<ReportResult> {
  const quotas = await prisma.quota.findMany({
    where: { periodStart: { gte: new Date(f.from.getTime() - 92 * 86_400_000), lte: f.to }, ...(f.staffId ? { userId: f.staffId } : {}), ...(f.brokerId ? { brokerId: f.brokerId } : {}), ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}) },
    include: { user: { select: { name: true } }, broker: true, brokerage: { select: { name: true } } },
    orderBy: [{ periodStart: "asc" }],
  });
  const rows = [];
  for (const q of quotas) {
    const start = q.periodStart;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (q.periodType === "QUARTER" ? 3 : 1), 1) - 1);
    const where: Prisma.TransactionWhereInput = {
      deletedAt: null,
      ...ACTIVE,
      reservedAt: { gte: start, lte: end },
      ...(f.developmentId ? { developmentId: f.developmentId } : {}),
      ...(q.targetType === "STAFF" ? { handlingStaffId: q.userId } : q.targetType === "BROKER" ? { brokerId: q.brokerId } : { brokerageId: q.brokerageId }),
    };
    const agg = await prisma.transaction.aggregate({ where, _count: true, _sum: { tcpCents: true } });
    const target = q.targetType === "STAFF" ? q.user?.name : q.targetType === "BROKER" ? (q.broker ? fullName(q.broker) : "") : q.brokerage?.name;
    rows.push({
      period: q.periodType === "QUARTER" ? `${start.getUTCFullYear()}-Q${Math.floor(start.getUTCMonth() / 3) + 1}` : monthKey(start),
      targetType: label(q.targetType),
      target,
      unitsQuota: q.units,
      unitsActual: agg._count,
      unitsPct: q.units ? (agg._count / q.units) * 100 : null,
      valueQuota: q.valueCents != null ? n(q.valueCents) : null,
      valueActual: n(agg._sum.tcpCents),
      valuePct: q.valueCents ? (n(agg._sum.tcpCents) / n(q.valueCents)) * 100 : null,
    });
  }
  return {
    tables: [
      {
        title: "Quota vs actual",
        columns: [
          { key: "period", label: "Period" },
          { key: "targetType", label: "Type" },
          { key: "target", label: "Staff / broker / brokerage" },
          { key: "unitsQuota", label: "Units quota", type: "number" },
          { key: "unitsActual", label: "Units actual", type: "number" },
          { key: "unitsPct", label: "Units attainment %", type: "pct" },
          { key: "valueQuota", label: "Value quota", type: "money" },
          { key: "valueActual", label: "Value actual (TCP)", type: "money" },
          { key: "valuePct", label: "Value attainment %", type: "pct" },
        ],
        rows,
      },
    ],
    note: "Actuals count active (non-cancelled) reservations in each quota period. Set quotas in Admin → Quotas.",
  };
}

// ── Inventory ──
export async function inventoryReport(f: ReportFilters): Promise<ReportResult> {
  const devs = await prisma.development.findMany({ where: { deletedAt: null, ...(f.developmentId ? { id: f.developmentId } : {}) }, orderBy: { name: "asc" } });
  const today = Date.now();
  const months = Math.max(1, (f.to.getTime() - f.from.getTime()) / (30.44 * 86_400_000));
  const rows = [];
  for (const d of devs) {
    const [units, sold] = await Promise.all([
      prisma.unit.findMany({ where: { developmentId: d.id, deletedAt: null }, select: { status: true, availableSince: true } }),
      prisma.transaction.count({ where: { developmentId: d.id, deletedAt: null, ...ACTIVE, reservedAt: { gte: f.from, lte: f.to }, items: { some: { kind: "UNIT" } } } }),
    ]);
    const c = (s: string) => units.filter((u) => u.status === s).length;
    const avail = units.filter((u) => u.status === "AVAILABLE");
    const ages = avail.map((u) => (u.availableSince ? (today - u.availableSince.getTime()) / 86_400_000 : 0));
    const bucket = (lo: number, hi: number) => ages.filter((a) => a >= lo && a < hi).length;
    rows.push({
      development: d.name,
      total: units.length,
      available: c("AVAILABLE"),
      onHold: c("ON_HOLD"),
      reserved: c("RESERVED"),
      sold: c("SOLD"),
      blocked: c("BLOCKED"),
      absorption: sold / months,
      sellThrough: units.length ? ((c("RESERVED") + c("SOLD")) / units.length) * 100 : 0,
      avgDaysAvailable: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
      age0_90: bucket(0, 91),
      age91_180: bucket(91, 181),
      age181_365: bucket(181, 366),
      age365: bucket(366, 1e9),
    });
  }
  const pls = await prisma.priceList.findMany({ where: { ...(f.developmentId ? { developmentId: f.developmentId } : {}) }, include: { development: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: [{ developmentId: "asc" }, { version: "desc" }] });
  return {
    tables: [
      {
        title: "Inventory",
        columns: [
          { key: "development", label: "Development" },
          { key: "total", label: "Units", type: "number" },
          { key: "available", label: "Available", type: "number" },
          { key: "onHold", label: "On hold", type: "number" },
          { key: "reserved", label: "Reserved", type: "number" },
          { key: "sold", label: "Sold", type: "number" },
          { key: "blocked", label: "Blocked", type: "number" },
          { key: "sellThrough", label: "Sell-through %", type: "pct" },
          { key: "absorption", label: "Absorption (units/mo, period)", type: "number" },
          { key: "avgDaysAvailable", label: "Avg days available", type: "number" },
          { key: "age0_90", label: "Aging 0–90d", type: "number" },
          { key: "age91_180", label: "91–180d", type: "number" },
          { key: "age181_365", label: "181–365d", type: "number" },
          { key: "age365", label: "365d+", type: "number" },
        ],
        rows,
      },
      {
        title: "Price list history",
        columns: [
          { key: "development", label: "Development" },
          { key: "version", label: "Version", type: "number" },
          { key: "effectiveDate", label: "Effective", type: "date" },
          { key: "items", label: "Items", type: "number" },
          { key: "status", label: "Status" },
          { key: "notes", label: "Notes" },
        ],
        rows: pls.map((p) => ({ development: p.development.name, version: p.version, effectiveDate: p.effectiveDate, items: p._count.items, status: p.appliedAt ? "Applied" : "Scheduled", notes: p.notes })),
      },
    ],
    charts: [
      {
        title: "Units by status",
        spec: { kind: "bar", x: "development", series: [{ key: "available", label: "Available" }, { key: "onHold", label: "On hold" }, { key: "reserved", label: "Reserved" }, { key: "sold", label: "Sold" }], data: rows.map((r) => ({ development: r.development, available: r.available, onHold: r.onHold, reserved: r.reserved, sold: r.sold })), format: "number" },
      },
    ],
  };
}

// ── Collections ──
export async function collectionsReport(f: ReportFilters): Promise<ReportResult> {
  const where: Prisma.TransactionWhereInput = { deletedAt: null, ...ACTIVE, ...(f.developmentId ? { developmentId: f.developmentId } : {}), ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}), ...(f.brokerId ? { brokerId: f.brokerId } : {}), ...(f.staffId ? { handlingStaffId: f.staffId } : {}) };
  const txs = await prisma.transaction.findMany({ where, include: { client: true, development: { select: { name: true } }, schedule: true, payments: { where: { voidedAt: null } } }, orderBy: { code: "asc" } });
  const asOf = f.to.getTime() > Date.now() ? manilaToday() : f.to;
  const rows = txs.map((t) => {
    const s = summarizeCollections(
      t.schedule.map((i) => ({ seq: i.seq, dueDate: i.dueDate, amountCents: n(i.amountCents) })),
      t.payments.reduce((a, p) => a + n(p.amountCents), 0),
      asOf,
    );
    const inPeriod = t.payments.filter((p) => p.paidAt >= f.from && p.paidAt <= f.to).reduce((a, p) => a + n(p.amountCents), 0);
    return {
      code: t.code,
      client: fullName(t.client),
      development: t.development.name,
      status: label(t.status),
      dueToDate: s.dueToDateCents,
      collected: s.paidCents,
      collectedInPeriod: inPeriod,
      arrears: s.arrearsCents,
      a30: s.aging["1-30"],
      a60: s.aging["31-60"],
      a90: s.aging["61-90"],
      a90p: s.aging["90+"],
      nextDue: s.nextDue?.dueDate ?? null,
    };
  });
  return {
    tables: [
      {
        title: "Collections",
        columns: [
          { key: "code", label: "Transaction" },
          { key: "client", label: "Client" },
          { key: "development", label: "Development" },
          { key: "status", label: "Status" },
          { key: "dueToDate", label: "Due to date", type: "money" },
          { key: "collected", label: "Collected (total)", type: "money" },
          { key: "collectedInPeriod", label: "Collected in period", type: "money" },
          { key: "arrears", label: "Arrears", type: "money" },
          { key: "a30", label: "1–30d", type: "money" },
          { key: "a60", label: "31–60d", type: "money" },
          { key: "a90", label: "61–90d", type: "money" },
          { key: "a90p", label: "90d+", type: "money" },
          { key: "nextDue", label: "Next due", type: "date" },
        ],
        rows,
      },
    ],
    charts: [
      {
        title: "Arrears aging",
        spec: { kind: "bar", x: "bucket", series: [{ key: "amount", label: "Arrears" }], format: "money", data: [["1–30d", "a30"], ["31–60d", "a60"], ["61–90d", "a90"], ["90d+", "a90p"]].map(([b, k]) => ({ bucket: b, amount: rows.reduce((a, r: any) => a + r[k], 0) })) },
      },
    ],
    note: "Based on recorded payments (manual/CSV). Arrears as of the end of the period (or today).",
  };
}

// ── Commissions ──
export async function commissionsReport(f: ReportFilters): Promise<ReportResult> {
  const ledgers = await prisma.commissionLedger.findMany({
    where: { transaction: txWhere(f), ...(f.brokerageId ? { brokerageId: f.brokerageId } : {}), ...(f.brokerId ? { brokerId: f.brokerId } : {}) },
    include: { broker: true, brokerage: { select: { name: true } }, tranches: true },
  });
  const by = new Map<string, any>();
  for (const l of ledgers) {
    const key = l.brokerId ?? "-";
    const r = by.get(key) ?? { broker: l.broker ? fullName(l.broker) : "—", brokerage: l.brokerage?.name ?? "Independent", earned: 0, notDue: 0, due: 0, approved: 0, released: 0, forfeited: 0 };
    r.earned += n(l.earnedCents);
    for (const t of l.tranches) {
      const k = { NOT_DUE: "notDue", DUE: "due", APPROVED: "approved", RELEASED: "released", FORFEITED: "forfeited" }[t.status]!;
      r[k] += n(t.amountCents);
    }
    by.set(key, r);
  }
  const rows = [...by.values()].sort((a, b) => b.earned - a.earned);
  const payable = await commissionsPayable(f);
  return {
    tables: [
      {
        title: "Commissions",
        columns: [
          { key: "broker", label: "Broker" },
          { key: "brokerage", label: "Brokerage" },
          { key: "earned", label: "Earned", type: "money" },
          { key: "notDue", label: "Not due", type: "money" },
          { key: "due", label: "Due", type: "money" },
          { key: "approved", label: "Approved", type: "money" },
          { key: "released", label: "Released", type: "money" },
          { key: "forfeited", label: "Forfeited", type: "money" },
        ],
        rows,
      },
      payable,
    ],
    note: "Earned = ledgers on transactions reserved in the period.",
  };
}

// ── Marketing ──
export async function marketingReport(f: ReportFilters): Promise<ReportResult> {
  const [leads, won, campaigns, sources, seqs] = await Promise.all([
    prisma.lead.findMany({ where: leadWhere(f), select: { id: true, sourceCode: true, campaignId: true, stage: { select: { isWon: true } } } }),
    prisma.pipelineStage.findFirst({ where: { isWon: true } }),
    prisma.campaign.findMany({ where: { deletedAt: null } }),
    prisma.picklist.findMany({ where: { type: "LEAD_SOURCE" } }),
    prisma.emailSequence.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  void won;
  const srcLabel = new Map(sources.map((s) => [s.code, s.label]));
  const bySource = new Map<string, { leads: number; res: number }>();
  const byCampaign = new Map<string, { leads: number; res: number }>();
  for (const l of leads) {
    const s = bySource.get(l.sourceCode) ?? { leads: 0, res: 0 };
    s.leads++;
    if (l.stage.isWon) s.res++;
    bySource.set(l.sourceCode, s);
    if (l.campaignId) {
      const c = byCampaign.get(l.campaignId) ?? { leads: 0, res: 0 };
      c.leads++;
      if (l.stage.isWon) c.res++;
      byCampaign.set(l.campaignId, c);
    }
  }
  const sourceRows = [...bySource.entries()].map(([k, v]) => ({ source: srcLabel.get(k) ?? k, leads: v.leads, reservations: v.res, conversion: v.leads ? (v.res / v.leads) * 100 : null })).sort((a, b) => b.leads - a.leads);
  const campaignRows = campaigns
    .map((c) => {
      const v = byCampaign.get(c.id) ?? { leads: 0, res: 0 };
      const cost = n(c.budgetCents);
      return { campaign: c.name, channel: c.channel, budget: cost, leads: v.leads, reservations: v.res, cpl: v.leads ? Math.round(cost / v.leads) : null, cpr: v.res ? Math.round(cost / v.res) : null, conversion: v.leads ? (v.res / v.leads) * 100 : null };
    })
    .filter((r) => r.leads || r.budget);
  const seqRows = await Promise.all(
    seqs.map(async (s) => {
      const [sent, replied, enrolled] = await Promise.all([
        prisma.sequenceSend.count({ where: { enrollment: { sequenceId: s.id }, status: "SENT", sentAt: { gte: f.from, lte: f.to } } }),
        prisma.sequenceSend.count({ where: { enrollment: { sequenceId: s.id }, repliedAt: { gte: f.from, lte: f.to } } }),
        prisma.sequenceEnrollment.count({ where: { sequenceId: s.id, createdAt: { gte: f.from, lte: f.to } } }),
      ]);
      return { sequence: s.name, enrolled, sent, replied, replyRate: sent ? (replied / sent) * 100 : null };
    }),
  );
  return {
    tables: [
      {
        title: "Leads by source",
        columns: [
          { key: "source", label: "Source" },
          { key: "leads", label: "Leads", type: "number" },
          { key: "reservations", label: "Reservations", type: "number" },
          { key: "conversion", label: "Lead → reservation %", type: "pct" },
        ],
        rows: sourceRows,
      },
      {
        title: "Campaigns",
        columns: [
          { key: "campaign", label: "Campaign" },
          { key: "channel", label: "Channel" },
          { key: "budget", label: "Budget", type: "money" },
          { key: "leads", label: "Leads", type: "number" },
          { key: "reservations", label: "Reservations", type: "number" },
          { key: "cpl", label: "Cost per lead", type: "money" },
          { key: "cpr", label: "Cost per reservation", type: "money" },
          { key: "conversion", label: "Conversion %", type: "pct" },
        ],
        rows: campaignRows,
      },
      {
        title: "Email sequences",
        columns: [
          { key: "sequence", label: "Sequence" },
          { key: "enrolled", label: "Enrolled", type: "number" },
          { key: "sent", label: "Sent", type: "number" },
          { key: "replied", label: "Replies", type: "number" },
          { key: "replyRate", label: "Reply rate %", type: "pct" },
        ],
        rows: seqRows,
      },
    ],
    charts: [{ title: "Leads by source", spec: { kind: "hbar", x: "source", series: [{ key: "leads", label: "Leads" }], data: sourceRows.map((r) => ({ source: r.source, leads: r.leads })), format: "number" } }],
    note: "Open rates aren't available via Microsoft Graph; reply rates come from mailbox capture.",
  };
}
