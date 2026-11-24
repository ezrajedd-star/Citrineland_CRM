import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, Pagination } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { AuditTable } from "@/components/app/audit-table";
import { parseDay } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("audit:view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params, 50);
  const from = parseDay(sp(params, "from"));
  const to = parseDay(sp(params, "to"));
  const where: any = {
    ...(sp(params, "entity") ? { entity: sp(params, "entity") } : {}),
    ...(sp(params, "actorId") ? { actorId: sp(params, "actorId") } : {}),
    ...(sp(params, "action") ? { action: sp(params, "action") } : {}),
    ...(sp(params, "entityId") ? { entityId: sp(params, "entityId") } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}) } } : {}),
  };
  const [rows, total, entities, actions, users] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="Creates, updates, deletes and document downloads on core records." />
      <Card>
        <FilterBar
          basePath="/admin/audit"
          values={params}
          filters={[
            { type: "search", name: "entityId", placeholder: "Record ID" },
            { type: "select", name: "entity", label: "Entity", options: entities.map((e) => ({ value: e.entity, label: e.entity })) },
            { type: "select", name: "action", label: "Action", options: actions.map((e) => ({ value: e.action, label: e.action })) },
            { type: "select", name: "actorId", label: "User", options: users.map((u) => ({ value: u.id, label: u.name })) },
            { type: "date", name: "from", label: "From" },
            { type: "date", name: "to", label: "To" },
          ]}
        />
        <AuditTable rows={rows as any} />
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/admin/audit" />
      </Card>
    </>
  );
}
