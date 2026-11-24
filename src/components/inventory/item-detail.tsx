import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { AuditTable } from "@/components/app/audit-table";
import { getInventoryItems } from "@/server/queries/inventory";
import { QuickDetails } from "./stack-plan";
import { ItemActions } from "./item-actions";
import { saveUnit, saveParking, deleteInventoryItem } from "@/server/actions/inventory";
import { unitFields, parkingFields } from "@/components/forms/inventory-fields";
import { formatDateTime, formatDay, dayInput, manilaToday } from "@/lib/format";
import { formatPeso } from "@/lib/money";
import { label } from "@/lib/labels";
import { fullName } from "@/lib/utils";

export async function InventoryItemDetail({ kind, id, user }: { kind: "UNIT" | "PARKING"; id: string; user: CurrentUser }) {
  const raw = kind === "UNIT" ? await prisma.unit.findFirst({ where: { id, deletedAt: null } }) : await prisma.parkingSlot.findFirst({ where: { id, deletedAt: null } });
  if (!raw) notFound();
  const { items } = await getInventoryItems({ developmentId: raw.developmentId, kind, q: raw.code });
  const item = items.find((i) => i.id === id)!;
  const where = kind === "UNIT" ? { unitId: id } : { parkingSlotId: id };
  const [logs, holds, prices, txItems, auditRows, sections, leads] = await Promise.all([
    prisma.inventoryStatusLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.hold.findMany({ where, orderBy: { createdAt: "desc" }, take: 20, include: { placedBy: { select: { name: true } }, lead: { select: { firstName: true, lastName: true } } } }),
    prisma.priceListItem.findMany({ where, include: { priceList: true }, orderBy: { priceList: { version: "desc" } } }),
    prisma.transactionItem.findMany({ where, include: { transaction: { include: { client: true } } }, orderBy: { transaction: { reservedAt: "desc" } } }),
    prisma.auditLog.findMany({ where: { entity: kind === "UNIT" ? "Unit" : "ParkingSlot", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.section.findMany({ where: { developmentId: raw.developmentId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.lead.findMany({ where: { deletedAt: null, stage: { isWon: false, isLost: false } }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean) as string[])];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const secOpts = sections.map((s) => ({ value: s.id, label: s.name }));
  const perms = { hold: can(user, "holds:create"), release: can(user, "holds:release"), block: can(user, "units:block"), price: can(user, "price_lists:update"), reserve: can(user, "transactions:create") };
  return (
    <>
      <PageHeader
        title={`${kind === "PARKING" ? "Parking " : ""}${item.code}`}
        description={`${item.developmentName}${item.sectionName ? ` · ${item.sectionName}` : ""}`}
        breadcrumbs={[
          { href: "/inventory", label: "Inventory" },
          { href: `/developments/${item.developmentId}`, label: item.developmentName },
        ]}
        actions={
          <>
            {can(user, "units:update") && (
              <FormDialog
                title="Edit"
                triggerLabel="Edit"
                triggerVariant="outline"
                wide
                schema={kind === "UNIT" ? "unit" : "parking"}
                fields={kind === "UNIT" ? unitFields(secOpts, false) : parkingFields(secOpts, false)}
                action={kind === "UNIT" ? saveUnit : saveParking}
                defaultValues={{ ...raw, floorArea: (raw as any).floorArea?.toString(), lotArea: (raw as any).lotArea?.toString(), listPriceCents: undefined }}
              />
            )}
            {can(user, "units:delete") && (
              <ConfirmAction action={deleteInventoryItem} args={{ kind, id }} title={`Delete ${item.code}?`} description="Only items with no transaction history can be deleted." destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickDetails item={item} />
            <ItemActions item={item} perms={perms} me={user.id} leadOptions={leads.map((l) => ({ value: l.id, label: fullName(l) }))} today={dayInput(manilaToday())} />
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <Table>
              <TBody>
                {txItems.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link className="text-brand-800 hover:underline" href={`/transactions/${t.transactionId}`}>
                        {t.transaction.code}
                      </Link>
                    </TD>
                    <TD>{fullName(t.transaction.client)}</TD>
                    <TD>
                      <StatusBadge status={t.transaction.status} label={label(t.transaction.status)} />
                    </TD>
                    <TD className="text-right tabular">{formatPeso(t.listPriceCents)}</TD>
                    <TD className="text-xs">{formatDateTime(t.transaction.reservedAt)}</TD>
                  </TR>
                ))}
                {txItems.length === 0 && (
                  <TR>
                    <TD className="text-sm text-muted-foreground">No transactions.</TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Price history</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Version</TH>
                  <TH>Effective</TH>
                  <TH className="text-right">Previous</TH>
                  <TH className="text-right">Price</TH>
                  <TH>Notes</TH>
                </TR>
              </THead>
              <TBody>
                {prices.map((p) => (
                  <TR key={p.id}>
                    <TD>v{p.priceList.version}</TD>
                    <TD>
                      {formatDay(p.priceList.effectiveDate)}
                      {!p.priceList.appliedAt && <span className="ml-1 text-xs text-amber-700">(scheduled)</span>}
                    </TD>
                    <TD className="text-right tabular">{p.previousPriceCents ? formatPeso(p.previousPriceCents) : "—"}</TD>
                    <TD className="text-right tabular">{formatPeso(p.priceCents)}</TD>
                    <TD className="text-xs text-muted-foreground">{p.priceList.notes}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status log & holds</CardTitle>
            </CardHeader>
            <Table>
              <TBody>
                {logs.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</TD>
                    <TD className="text-xs">
                      {label(l.fromStatus)} → <b>{label(l.toStatus)}</b>
                    </TD>
                    <TD className="text-xs">{label(l.event)}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {actors.get(l.actorId ?? "") ?? "System"}
                      {l.reason ? ` · ${l.reason}` : ""}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {holds.length > 0 && (
              <div className="border-t p-3 text-xs text-muted-foreground">
                {holds.map((h) => (
                  <div key={h.id}>
                    Hold by {h.placedBy.name}
                    {h.lead ? ` for ${fullName(h.lead)}` : ""} · {formatDateTime(h.createdAt)} → {label(h.status)}
                    {h.releasedAt ? ` ${formatDateTime(h.releasedAt)}` : ` (expires ${formatDateTime(h.expiresAt)})`}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <AuditTable rows={auditRows as any} showEntity={false} />
          </Card>
        </div>
      </div>
    </>
  );
}
