import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { saveRole } from "@/server/actions/admin-users";
import { ALL_PERMISSIONS } from "@/lib/rbac/permissions";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const me = await requirePermission("roles:view");
  const roles = await prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { _count: { select: { users: { where: { deletedAt: null } } } } } });
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        actions={
          me.permissions.has("roles:manage") && (
            <FormDialog
              title="New role"
              schema="role"
              action={saveRole}
              columns={1}
              fields={[
                { name: "name", label: "Role name", required: true, autoFocus: true },
                { name: "description", label: "Description", type: "textarea" },
              ]}
            />
          )
        }
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Role</TH>
              <TH>Users</TH>
              <TH>Permissions</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {roles.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/admin/roles/${r.id}`} className="font-medium text-brand-800 hover:underline">
                    {r.name}
                  </Link>{" "}
                  {r.isSystem && <Badge variant="secondary">System</Badge>}
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                </TD>
                <TD className="tabular">{r._count.users}</TD>
                <TD className="tabular">{r.permissions.includes("*") ? "All" : `${r.permissions.length} / ${ALL_PERMISSIONS.length}`}</TD>
                <TD className="text-right">
                  <Link href={`/admin/roles/${r.id}`} className="text-sm text-brand-700 hover:underline">
                    Open matrix →
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
