import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, StatusBadge, EmptyState } from "@/components/app/page";
import { FormDialog } from "@/components/app/form-dialog";
import { saveDevelopment } from "@/server/actions/inventory";
import { developmentFields } from "@/components/forms/inventory-fields";
import { label } from "@/lib/labels";
import { inventoryStatusColors } from "@/config/brand";
import { Building2 } from "lucide-react";

export const metadata = { title: "Developments" };

export default async function DevelopmentsPage() {
  const user = await requirePermission("developments:view");
  const devs = await prisma.development.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const [unitCounts, slotCounts] = await Promise.all([
    prisma.unit.groupBy({ by: ["developmentId", "status"], where: { deletedAt: null }, _count: true }),
    prisma.parkingSlot.groupBy({ by: ["developmentId", "status"], where: { deletedAt: null }, _count: true }),
  ]);
  const counts = (devId: string, rows: typeof unitCounts) => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.developmentId === devId) m[r.status] = r._count;
    return m;
  };
  return (
    <>
      <PageHeader
        title="Developments"
        actions={user.permissions.has("developments:create") && <FormDialog title="New development" schema="development" fields={developmentFields} action={saveDevelopment} defaultValues={{ status: "PRE_SELLING" }} wide />}
      />
      {devs.length === 0 ? (
        <EmptyState title="No developments yet" icon={<Building2 className="h-6 w-6" />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {devs.map((d) => {
            const u = counts(d.id, unitCounts);
            const p = counts(d.id, slotCounts as any);
            const total = Object.values(u).reduce((a, b) => a + b, 0);
            return (
              <Link key={d.id} href={`/developments/${d.id}`} className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:border-brand-300">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-stone-500">{d.code}</div>
                    <div className="text-lg font-semibold">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {label(d.type)} · {[d.city, d.province].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <StatusBadge status={d.status} label={label(d.status)} />
                </div>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-stone-100">
                  {total > 0 &&
                    ["SOLD", "RESERVED", "ON_HOLD", "BLOCKED", "AVAILABLE"].map((s) => (
                      <div key={s} style={{ width: `${((u[s] ?? 0) / total) * 100}%`, background: inventoryStatusColors[s].text, opacity: 0.75 }} title={`${s}: ${u[s] ?? 0}`} />
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-600">
                  <span>{total} units</span>
                  {["AVAILABLE", "ON_HOLD", "RESERVED", "SOLD"].map((s) => (
                    <span key={s}>
                      {inventoryStatusColors[s].label}: <b className="tabular">{u[s] ?? 0}</b>
                    </span>
                  ))}
                  {Object.keys(p).length > 0 && <span>· {Object.values(p).reduce((a, b) => a + b, 0)} parking</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
