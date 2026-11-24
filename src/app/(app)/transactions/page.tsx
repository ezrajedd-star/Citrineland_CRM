import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, Pagination, EmptyState } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { developmentOptions, brokerOptions, userOptions } from "@/server/queries/options";
import { TX_STATUSES } from "@/domain/transactions/state-machine";
import { formatPeso } from "@/lib/money";
import { formatDay, parseDay } from "@/lib/format";
import { label } from "@/lib/labels";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("transactions:view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const from = parseDay(sp(params, "from"));
  const to = parseDay(sp(params, "to"));
  const where: Prisma.TransactionWhereInput = {
    deletedAt: null,
    ...(sp(params, "status") === "ACTIVE" ? { status: { notIn: ["CANCELLED", "TRANSFERRED"] } } : sp(params, "status") ? { status: sp(params, "status") as any } : {}),
    ...(sp(params, "developmentId") ? { developmentId: sp(params, "developmentId") } : {}),
    ...(sp(params, "brokerId") ? { brokerId: sp(params, "brokerId") } : {}),
    ...(sp(params, "staffId") ? { handlingStaffId: sp(params, "staffId") } : {}),
    ...(from || to ? { reservedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { client: { normalizedName: { contains: q.toLowerCase() } } }, { items: { some: { unit: { code: { contains: q, mode: "insensitive" } } } } }] } : {}),
  };
  const [rows, total, devs, brokers, users, counts] = await Promise.all([
    prisma.transaction.findMany({ where, include: { client: true, broker: true, development: { select: { code: true } }, items: { include: { unit: { select: { code: true } }, parkingSlot: { select: { code: true } } } } }, orderBy: { reservedAt: "desc" }, skip, take }),
    prisma.transaction.count({ where }),
    developmentOptions(),
    brokerOptions(),
    userOptions(),
    prisma.transaction.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
  ]);
  const count = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <>
            {can(user, "payments:import") && (
              <Button asChild variant="outline" size="sm">
                <Link href="/transactions/import-payments">Import payments (CSV)</Link>
              </Button>
            )}
            {can(user, "transactions:create") && (
              <Button asChild size="sm">
                <Link href="/transactions/new">New reservation</Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[{ key: "", label: "All" }, { key: "ACTIVE", label: "Active" }, ...TX_STATUSES.map((s) => ({ key: s, label: label(s) }))].map((s) => (
          <Link
            key={s.key}
            href={`/transactions?${new URLSearchParams({ ...(params as Record<string, string>), status: s.key, page: "1" }).toString()}`}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${(sp(params, "status") ?? "") === s.key ? "border-brand-500 bg-brand-50 font-medium text-brand-800" : "bg-white text-stone-600 hover:bg-stone-50"}`}
          >
            {s.label}
            {s.key && s.key !== "ACTIVE" && count[s.key] ? ` · ${count[s.key]}` : ""}
          </Link>
        ))}
      </div>
      <Card>
        <FilterBar
          basePath="/transactions"
          values={params}
          extra={<input type="hidden" name="status" value={sp(params, "status") ?? ""} />}
          filters={[
            { type: "search", name: "q", placeholder: "Code, client, unit" },
            { type: "select", name: "developmentId", label: "Development", options: devs },
            { type: "select", name: "brokerId", label: "Broker", options: brokers },
            { type: "select", name: "staffId", label: "Handling staff", options: users },
            { type: "date", name: "from", label: "Reserved from" },
            { type: "date", name: "to", label: "to" },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Buyer</TH>
              <TH>Items</TH>
              <TH>Broker</TH>
              <TH>Status</TH>
              <TH className="text-right">TCP</TH>
              <TH>Reserved</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link href={`/transactions/${t.id}`} className="font-medium text-brand-800 hover:underline">
                    {t.code}
                  </Link>
                </TD>
                <TD>{fullName(t.client)}</TD>
                <TD className="text-xs">
                  {t.development.code} · {t.items.map((i) => i.unit?.code ?? i.parkingSlot?.code).join(", ")}
                </TD>
                <TD className="text-xs">{t.broker ? fullName(t.broker) : "Direct"}</TD>
                <TD>
                  <StatusBadge status={t.status} label={label(t.status)} />
                </TD>
                <TD className="text-right tabular">{formatPeso(t.tcpCents)}</TD>
                <TD className="text-xs">{formatDay(t.reservedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <EmptyState title="No transactions" />}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/transactions" />
      </Card>
    </>
  );
}
