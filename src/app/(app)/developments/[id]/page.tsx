import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, LinkTabs, DL, EmptyState, StatCard } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { AuditTable } from "@/components/app/audit-table";
import { saveDevelopment, deleteDevelopment, saveSection, deleteSection, saveUnit, saveParking, savePaymentScheme, savePriceChange } from "@/server/actions/inventory";
import { developmentFields, sectionFields, unitFields, parkingFields, paymentSchemeFields } from "@/components/forms/inventory-fields";
import { label } from "@/lib/labels";
import { SchemesTable } from "@/components/app/schemes-table";
import { formatDay, formatDateTime, dayInput, manilaToday, daysBetween } from "@/lib/format";
import { formatPeso, n } from "@/lib/money";
import { formatPct } from "@/lib/format";

export default async function DevelopmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("developments:view");
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const dev = await prisma.development.findFirst({ where: { id, deletedAt: null } });
  if (!dev) notFound();
  const sections = await prisma.section.findMany({ where: { developmentId: id, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const sectionOpts = sections.map((s) => ({ value: s.id, label: s.name }));
  const [unitCount, slotCount, plCount, schemeCount] = await Promise.all([
    prisma.unit.count({ where: { developmentId: id, deletedAt: null } }),
    prisma.parkingSlot.count({ where: { developmentId: id, deletedAt: null } }),
    prisma.priceList.count({ where: { developmentId: id } }),
    prisma.paymentScheme.count({ where: { OR: [{ developmentId: id }, { developmentId: null }], deletedAt: null } }),
  ]);
  const canEdit = can(user, "developments:update");
  const base = `/developments/${id}`;
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "sections", label: "Sections", count: sections.length },
    { key: "units", label: "Units", count: unitCount },
    { key: "parking", label: "Parking", count: slotCount },
    { key: "prices", label: "Price lists", count: plCount },
    { key: "schemes", label: "Payment schemes", count: schemeCount },
    { key: "documents", label: "Documents" },
    { key: "stats", label: "Sales stats" },
    { key: "history", label: "History" },
  ];

  return (
    <>
      <PageHeader
        title={dev.name}
        description={
          <span className="flex items-center gap-2">
            {dev.code} · {label(dev.type)} <StatusBadge status={dev.status} label={label(dev.status)} />
          </span>
        }
        breadcrumbs={[{ href: "/developments", label: "Developments" }]}
        actions={
          <>
            <Link href={`/inventory?developmentId=${id}&view=stack`} className="text-sm text-brand-700 hover:underline">
              Stack plan →
            </Link>
            {canEdit && (
              <FormDialog
                title="Edit development"
                triggerLabel="Edit"
                triggerVariant="outline"
                schema="development"
                fields={developmentFields}
                action={saveDevelopment}
                wide
                defaultValues={{ ...dev, targetTurnoverDate: dayInput(dev.targetTurnoverDate) }}
              />
            )}
            {can(user, "developments:delete") && (
              <ConfirmAction action={deleteDevelopment} args={{ id }} title={`Delete ${dev.name}?`} description="Only developments without transactions can be deleted." destructive>
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <LinkTabs tabs={tabs} active={tab} baseHref={base} />
      {tab === "overview" && (
        <Card>
          <CardContent className="pt-4">
            <DL
              cols={3}
              items={[
                ["Type", label(dev.type)],
                ["Status", label(dev.status)],
                ["License to Sell (DHSUD)", dev.ltsNumber],
                ["Address", [dev.address, dev.city, dev.province].filter(Boolean).join(", ")],
                ["Target turnover", formatDay(dev.targetTurnoverDate)],
                ["Created", formatDateTime(dev.createdAt)],
              ]}
            />
            {dev.description && <p className="mt-4 whitespace-pre-wrap text-sm text-stone-700">{dev.description}</p>}
          </CardContent>
        </Card>
      )}
      {tab === "sections" && (
        <Card>
          <div className="flex justify-end border-b p-3">
            {canEdit && (
              <FormDialog
                title="Add section"
                schema="section"
                fields={sectionFields(sectionOpts)}
                action={saveSection}
                defaultValues={{ developmentId: id, kind: dev.type === "SUBDIVISION" ? "BLOCK" : "TOWER", sortOrder: sections.length }}
              />
            )}
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Code</TH>
                <TH>Kind</TH>
                <TH>Floors</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {sections.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD>{s.code}</TD>
                  <TD>{label(s.kind)}</TD>
                  <TD>{s.floors ?? "—"}</TD>
                  <TD className="text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <FormDialog title="Edit section" triggerLabel="Edit" triggerVariant="ghost" schema="section" fields={sectionFields(sectionOpts.filter((o) => o.value !== s.id))} action={saveSection} defaultValues={s} />
                        <ConfirmAction action={deleteSection} args={{ id: s.id }} title={`Delete ${s.name}?`} destructive variant="ghost">
                          Delete
                        </ConfirmAction>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {sections.length === 0 && <EmptyState title="No sections yet" description="Add towers/buildings (condo) or phases/blocks (subdivision)." />}
        </Card>
      )}
      {tab === "units" && <UnitsTab devId={id} canCreate={can(user, "units:create")} sectionOpts={sectionOpts} />}
      {tab === "parking" && <ParkingTab devId={id} canCreate={can(user, "units:create")} sectionOpts={sectionOpts} />}
      {tab === "prices" && <PricesTab devId={id} canEdit={can(user, "price_lists:update")} />}
      {tab === "schemes" && <SchemesTab devId={id} devName={dev.name} canEdit={can(user, "payment_schemes:manage")} />}
      {tab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            <DocumentsPanel entityType="Development" entityId={id} user={user} categories={["Brochure", "Photo", "Floor plan", "Price list", "License to Sell", "Other"]} />
          </CardContent>
        </Card>
      )}
      {tab === "stats" && <StatsTab devId={id} />}
      {tab === "history" && (
        <Card>
          <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Development", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
        </Card>
      )}
    </>
  );
}

async function UnitsTab({ devId, canCreate, sectionOpts }: { devId: string; canCreate: boolean; sectionOpts: { value: string; label: string }[] }) {
  const units = await prisma.unit.findMany({ where: { developmentId: devId, deletedAt: null }, include: { section: true }, orderBy: [{ section: { sortOrder: "asc" } }, { floor: "asc" }, { code: "asc" }], take: 500 });
  return (
    <Card>
      <div className="flex items-center justify-between border-b p-3">
        <Link href={`/inventory?developmentId=${devId}&kind=UNIT`} className="text-sm text-brand-700 hover:underline">
          Open in inventory (filters, holds, import) →
        </Link>
        {canCreate && <FormDialog title="Add unit" schema="unit" fields={unitFields(sectionOpts, true)} action={saveUnit} defaultValues={{ developmentId: devId }} wide />}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Code</TH>
            <TH>Section</TH>
            <TH>Type / model</TH>
            <TH>Floor / B-L</TH>
            <TH className="text-right">Area (sqm)</TH>
            <TH>Status</TH>
            <TH className="text-right">List price</TH>
          </TR>
        </THead>
        <TBody>
          {units.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">
                <Link href={`/inventory/units/${u.id}`} className="hover:underline">
                  {u.code}
                </Link>
              </TD>
              <TD>{u.section?.name ?? "—"}</TD>
              <TD>
                {label(u.unitType)}
                <div className="text-xs text-muted-foreground">{u.model}</div>
              </TD>
              <TD>{u.floor ?? [u.block && `B${u.block}`, u.lot && `L${u.lot}`].filter(Boolean).join("-")}</TD>
              <TD className="text-right tabular">{u.floorArea?.toString() ?? "—"}{u.lotArea ? ` / ${u.lotArea}` : ""}</TD>
              <TD>
                <StatusBadge status={u.status} />
              </TD>
              <TD className="text-right tabular">{formatPeso(u.listPriceCents)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {units.length === 0 && <EmptyState title="No units yet" description="Add units one by one or import a CSV/XLSX from Inventory." />}
    </Card>
  );
}

async function ParkingTab({ devId, canCreate, sectionOpts }: { devId: string; canCreate: boolean; sectionOpts: { value: string; label: string }[] }) {
  const slots = await prisma.parkingSlot.findMany({ where: { developmentId: devId, deletedAt: null }, include: { section: true }, orderBy: [{ level: "asc" }, { code: "asc" }], take: 500 });
  return (
    <Card>
      <div className="flex justify-end border-b p-3">{canCreate && <FormDialog title="Add parking slot" schema="parking" fields={parkingFields(sectionOpts, true)} action={saveParking} defaultValues={{ developmentId: devId, type: "REGULAR" }} />}</div>
      <Table>
        <THead>
          <TR>
            <TH>Slot</TH>
            <TH>Building</TH>
            <TH>Level</TH>
            <TH>Type</TH>
            <TH>Status</TH>
            <TH className="text-right">List price</TH>
          </TR>
        </THead>
        <TBody>
          {slots.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium">{s.code}</TD>
              <TD>{s.section?.name ?? "—"}</TD>
              <TD>{s.level ?? "—"}</TD>
              <TD>{label(s.type)}</TD>
              <TD>
                <StatusBadge status={s.status} />
              </TD>
              <TD className="text-right tabular">{formatPeso(s.listPriceCents)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {slots.length === 0 && <EmptyState title="No parking slots" />}
    </Card>
  );
}

async function PricesTab({ devId, canEdit }: { devId: string; canEdit: boolean }) {
  const lists = await prisma.priceList.findMany({
    where: { developmentId: devId },
    orderBy: { version: "desc" },
    include: { items: { include: { unit: { select: { code: true } }, parkingSlot: { select: { code: true } } }, take: 200 }, _count: { select: { items: true } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: lists.map((l) => l.createdById).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const uname = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>New price list version (across-the-board change)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Adjusts every unsold unit and parking slot by a percentage (rounded to the nearest ₱1,000). For per-item changes use the inventory quick panel, or import a CSV with new prices. Past versions stay visible below; reserved
              transactions keep their price snapshot.
            </p>
            <EntityFormLite devId={devId} />
          </CardContent>
        </Card>
      )}
      {lists.map((pl) => (
        <Card key={pl.id}>
          <details>
            <summary className="flex cursor-pointer items-center justify-between p-4 text-sm">
              <span>
                <b>Version {pl.version}</b> · effective {formatDay(pl.effectiveDate)} · {pl._count.items} item(s)
                {pl.notes && <span className="text-muted-foreground"> · {pl.notes}</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {pl.appliedAt ? `Applied ${formatDateTime(pl.appliedAt)}` : <span className="text-amber-700">Scheduled</span>} · {uname.get(pl.createdById ?? "") ?? "System"}
              </span>
            </summary>
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH className="text-right">Previous</TH>
                  <TH className="text-right">New price</TH>
                  <TH className="text-right">Change</TH>
                </TR>
              </THead>
              <TBody>
                {pl.items.map((it) => {
                  const prev = n(it.previousPriceCents);
                  const cur = n(it.priceCents);
                  return (
                    <TR key={it.id}>
                      <TD>{it.unit?.code ?? it.parkingSlot?.code}</TD>
                      <TD className="text-right tabular">{prev ? formatPeso(prev) : "—"}</TD>
                      <TD className="text-right tabular">{formatPeso(cur)}</TD>
                      <TD className="text-right tabular">{prev ? formatPct(((cur - prev) / prev) * 100) : "new"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </details>
        </Card>
      ))}
      {lists.length === 0 && <EmptyState title="No price lists yet" />}
    </div>
  );
}

function EntityFormLite({ devId }: { devId: string }) {
  return (
    <FormDialog
      title="Across-the-board price change"
      triggerLabel="Adjust prices by %"
      schema="priceChange"
      action={savePriceChange}
      defaultValues={{ developmentId: devId, effectiveDate: dayInput(manilaToday()), items: [] }}
      fields={[
        { name: "developmentId", label: "", type: "hidden" },
        { name: "adjustPct", label: "Adjust by", type: "percent", required: true, help: "e.g. 3 for a 3% increase, -2 for a decrease" },
        { name: "effectiveDate", label: "Effective date", type: "date", required: true },
        { name: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      submitLabel="Create version"
    />
  );
}

async function SchemesTab({ devId, devName, canEdit }: { devId: string; devName: string; canEdit: boolean }) {
  const schemes = await prisma.paymentScheme.findMany({ where: { OR: [{ developmentId: devId }, { developmentId: null }], deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const devOpts = [{ value: devId, label: devName }];
  return (
    <Card>
      <div className="flex justify-end border-b p-3">
        {canEdit && (
          <FormDialog title="Add payment scheme" schema="paymentScheme" fields={paymentSchemeFields(devOpts)} action={savePaymentScheme} wide defaultValues={{ developmentId: devId, active: true, spotDiscountPct: 0, spotDpDiscountPct: 0, sortOrder: 0, reservationFee: 25000 }} />
        )}
      </div>
      <SchemesTable schemes={schemes} canEdit={canEdit} devOpts={devOpts} />
    </Card>
  );
}

async function StatsTab({ devId }: { devId: string }) {
  const [byStatus, sold, firstLog, slots] = await Promise.all([
    prisma.unit.groupBy({ by: ["status"], where: { developmentId: devId, deletedAt: null }, _count: true, _sum: { listPriceCents: true } }),
    prisma.transaction.aggregate({ where: { developmentId: devId, deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED"] } }, _count: true, _sum: { tcpCents: true } }),
    prisma.transaction.findFirst({ where: { developmentId: devId }, orderBy: { reservedAt: "asc" }, select: { reservedAt: true } }),
    prisma.parkingSlot.groupBy({ by: ["status"], where: { developmentId: devId, deletedAt: null }, _count: true }),
  ]);
  const c = Object.fromEntries(byStatus.map((b) => [b.status, b._count]));
  const total = byStatus.reduce((a, b) => a + b._count, 0);
  const taken = (c.RESERVED ?? 0) + (c.SOLD ?? 0);
  const months = firstLog ? Math.max(1, daysBetween(firstLog.reservedAt, new Date()) / 30.4) : 1;
  const cancelled = await prisma.transaction.count({ where: { developmentId: devId, status: "CANCELLED" } });
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Units" value={total} sub={`${c.AVAILABLE ?? 0} available`} />
      <StatCard label="Reserved + sold" value={taken} sub={total ? formatPct((taken / total) * 100) + " of inventory" : undefined} />
      <StatCard label="TCP booked (active)" value={formatPeso(sold._sum.tcpCents ?? 0n)} sub={`${sold._count} active transactions`} />
      <StatCard label="Absorption" value={`${(taken / months).toFixed(1)} / mo`} sub="units reserved/sold per month since first sale" />
      <StatCard label="Unsold inventory value" value={formatPeso(byStatus.filter((b) => b.status === "AVAILABLE" || b.status === "ON_HOLD").reduce((a, b) => a + n(b._sum.listPriceCents), 0))} />
      <StatCard label="Cancellations" value={cancelled} tone={cancelled ? "warn" : undefined} />
      <StatCard label="Parking slots" value={slots.reduce((a, b) => a + b._count, 0)} sub={`${slots.find((s) => s.status === "AVAILABLE")?._count ?? 0} available`} />
      <StatCard label="On hold" value={c.ON_HOLD ?? 0} />
    </div>
  );
}
