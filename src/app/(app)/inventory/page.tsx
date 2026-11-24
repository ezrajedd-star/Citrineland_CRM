import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, Pagination, EmptyState } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getInventoryItems, type ItemVM } from "@/server/queries/inventory";
import { StackPlan, type StackSection } from "@/components/inventory/stack-plan";
import { formatPeso } from "@/lib/money";
import { label, options } from "@/lib/labels";
import { dayInput, manilaToday, relativeDays } from "@/lib/format";
import { fullName, cn } from "@/lib/utils";
import { E } from "@/lib/validation/schemas";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("units:view");
  const params = await searchParams;
  const view = sp(params, "view") ?? "table";
  const devs = await prisma.development.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } });
  const developmentId = sp(params, "developmentId") ?? (view === "stack" ? devs[0]?.id : undefined);
  const sections = developmentId ? await prisma.section.findMany({ where: { developmentId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [];
  const filters = { developmentId, sectionId: sp(params, "sectionId"), kind: sp(params, "kind") as any, status: sp(params, "status"), unitType: sp(params, "unitType"), q: sp(params, "q") };
  const perms = { hold: can(user, "holds:create"), release: can(user, "holds:release"), block: can(user, "units:block"), price: can(user, "price_lists:update"), reserve: can(user, "transactions:create") };
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) u.set(k, v);
    return `/inventory?${u.toString()}`;
  };

  const header = (
    <PageHeader
      title="Inventory"
      description="Units and parking slots across all developments"
      actions={
        <>
          <div className="flex rounded-md border bg-white p-0.5">
            <Link href={qs({ view: "table", page: undefined })} className={cn("rounded px-3 py-1 text-sm", view === "table" && "bg-brand-100 font-medium text-brand-800")}>
              Table
            </Link>
            <Link href={qs({ view: "stack", developmentId: developmentId ?? devs[0]?.id, page: undefined })} className={cn("rounded px-3 py-1 text-sm", view === "stack" && "bg-brand-100 font-medium text-brand-800")}>
              Stack plan
            </Link>
          </div>
          {can(user, "units:import") && (
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/import">Import CSV/XLSX</Link>
            </Button>
          )}
        </>
      }
    />
  );
  const filterBar = (
    <FilterBar
      basePath="/inventory"
      values={{ ...params, developmentId }}
      extra={<input type="hidden" name="view" value={view} />}
      filters={[
        { type: "search", name: "q", placeholder: "Unit/slot code or model" },
        { type: "select", name: "developmentId", label: "Development", options: devs.map((d) => ({ value: d.id, label: d.name })) },
        ...(sections.length ? [{ type: "select" as const, name: "sectionId", label: "Building / block", options: sections.map((s) => ({ value: s.id, label: s.name })) }] : []),
        { type: "select", name: "kind", label: "Kind", options: [{ value: "UNIT", label: "Units" }, { value: "PARKING", label: "Parking" }] },
        { type: "select", name: "unitType", label: "Unit type", options: options(E.UnitType) },
        { type: "select", name: "status", label: "Status", options: ["AVAILABLE", "ON_HOLD", "RESERVED", "SOLD", "BLOCKED"].map((s) => ({ value: s, label: label(s) })) },
      ]}
    />
  );

  if (view === "stack") {
    const { items } = await getInventoryItems(filters);
    const leads = await openLeadOptions(user.id, can(user, "leads:view_all"));
    const stack = buildStack(items, sections);
    return (
      <>
        {header}
        <Card className="mb-4">{filterBar}</Card>
        {stack.length === 0 ? <EmptyState title="Nothing to show" description="Pick a development with units." /> : <StackPlan sections={stack} perms={perms} me={user.id} leadOptions={leads} today={dayInput(manilaToday())} />}
      </>
    );
  }

  const { page, pageSize, skip, take } = pageParams(params, 50);
  const { items, total } = await getInventoryItems(filters, filters.kind ? { skip, take } : { take: skip + take });
  const pageItems = filters.kind ? items : items.slice(skip, skip + take);
  return (
    <>
      {header}
      <Card>
        {filterBar}
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Development / section</TH>
              <TH>Type</TH>
              <TH>Location</TH>
              <TH>Status</TH>
              <TH>Holder / buyer</TH>
              <TH className="text-right">List price</TH>
              <TH className="text-right">Aging</TH>
            </TR>
          </THead>
          <TBody>
            {pageItems.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">
                  <Link href={i.kind === "UNIT" ? `/inventory/units/${i.id}` : `/inventory/parking/${i.id}`} className="text-brand-800 hover:underline">
                    {i.code}
                  </Link>
                </TD>
                <TD className="text-xs">
                  {i.developmentName}
                  <div className="text-muted-foreground">{i.sectionName}</div>
                </TD>
                <TD className="text-xs">
                  {i.kind === "PARKING" ? `Parking · ${label(i.type)}` : label(i.type)}
                  {i.model && <div className="text-muted-foreground">{i.model}</div>}
                </TD>
                <TD className="text-xs">{i.kind === "PARKING" ? i.level : i.floor !== null ? `Flr ${i.floor}` : [i.block && `Blk ${i.block}`, i.lot && `Lot ${i.lot}`].filter(Boolean).join(" ")}</TD>
                <TD>
                  <StatusBadge status={i.status} />
                </TD>
                <TD className="text-xs">
                  {i.transaction ? (
                    <Link href={`/transactions/${i.transaction.id}`} className="hover:underline">
                      {i.transaction.client}
                      <div className="text-muted-foreground">{i.transaction.code}</div>
                    </Link>
                  ) : i.hold ? (
                    <>
                      {i.hold.party ?? i.hold.placedBy}
                      <div className="text-muted-foreground">expires {relativeDays(i.hold.expiresAt)}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-right tabular">{formatPeso(i.priceCents)}</TD>
                <TD className="text-right text-xs tabular">{i.daysAvailable !== null ? `${i.daysAvailable}d` : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {pageItems.length === 0 && <EmptyState title="No matching inventory" />}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/inventory" />
      </Card>
    </>
  );
}

async function openLeadOptions(userId: string, all: boolean) {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, stage: { isWon: false, isLost: false }, ...(all ? {} : { ownerId: userId }) },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: { id: true, firstName: true, lastName: true, mobile: true },
  });
  return leads.map((l) => ({ value: l.id, label: `${fullName(l)}${l.mobile ? ` · ${l.mobile}` : ""}` }));
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function buildStack(items: ItemVM[], sections: { id: string; name: string; kind: string }[]): StackSection[] {
  const out: StackSection[] = [];
  const bySection = new Map<string, ItemVM[]>();
  for (const i of items) {
    const key = `${i.kind}:${i.sectionId ?? "none"}`;
    bySection.set(key, [...(bySection.get(key) ?? []), i]);
  }
  const sectionMeta = new Map(sections.map((s) => [s.id, s]));
  const keys = [...bySection.keys()].sort((a, b) => (a.startsWith("UNIT") === b.startsWith("UNIT") ? 0 : a.startsWith("UNIT") ? -1 : 1));
  for (const key of keys) {
    const [kind, sid] = key.split(":");
    const list = bySection.get(key)!;
    const meta = sectionMeta.get(sid);
    const isTower = kind === "UNIT" && list.some((i) => i.floor !== null);
    const groupKey = (i: ItemVM) => (kind === "PARKING" ? (i.level ?? "—") : isTower ? String(i.floor ?? "—") : (i.block ?? meta?.name ?? "—"));
    const groups = new Map<string, ItemVM[]>();
    for (const i of list) groups.set(groupKey(i), [...(groups.get(groupKey(i)) ?? []), i]);
    const rowKeys = [...groups.keys()].sort(naturalCompare);
    if (isTower) rowKeys.reverse(); // top floor first
    out.push({
      id: key,
      name: `${kind === "PARKING" ? "Parking — " : ""}${meta?.name ?? "Unassigned"}`,
      kind: kind === "PARKING" ? "PARKING" : (meta?.kind ?? "SECTION"),
      rowLabel: kind === "PARKING" ? "Level" : isTower ? "Floor" : "Block",
      rows: rowKeys.map((k) => ({ label: k, cells: groups.get(k)!.sort((a, b) => naturalCompare(a.code, b.code)) })),
    });
  }
  return out;
}
