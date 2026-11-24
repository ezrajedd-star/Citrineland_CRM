import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { saveRole, deleteRole, saveRolePermissions } from "@/server/actions/admin-users";
import { PERMISSION_CATALOG, ALL_ACTIONS, PERMISSION_DESCRIPTIONS, ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { PermissionMatrix } from "./matrix";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("roles:view");
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) notFound();
  const isAdmin = role.key === "ADMIN";
  const canManage = me.permissions.has("roles:manage");
  const resources = Object.entries(PERMISSION_CATALOG).map(([key, v]) => ({ key, label: v.label, actions: [...v.actions] as string[] }));
  return (
    <>
      <PageHeader
        title={role.name}
        description={role.description}
        breadcrumbs={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/roles", label: "Roles" },
        ]}
        actions={
          canManage && (
            <>
              <FormDialog
                title="Rename role"
                triggerLabel="Rename"
                triggerVariant="outline"
                schema="role"
                action={saveRole}
                columns={1}
                defaultValues={{ id: role.id, name: role.name, description: role.description }}
                fields={[
                  { name: "id", label: "", type: "hidden" },
                  { name: "name", label: "Role name", required: true },
                  { name: "description", label: "Description", type: "textarea" },
                ]}
              />
              {!role.isSystem && (
                <ConfirmAction action={deleteRole} args={{ id: role.id }} title={`Delete role "${role.name}"?`} description="This cannot be undone. Roles with users cannot be deleted." destructive>
                  Delete
                </ConfirmAction>
              )}
            </>
          )
        }
      />
      <PermissionMatrix
        roleId={role.id}
        resources={resources}
        actions={ALL_ACTIONS}
        initial={isAdmin ? ALL_PERMISSIONS : role.permissions}
        readOnly={isAdmin || !canManage}
        readOnlyReason={isAdmin ? "The Admin role always has every permission." : !canManage ? "You can view but not change permissions." : undefined}
        descriptions={PERMISSION_DESCRIPTIONS as Record<string, string>}
        save={saveRolePermissions}
      />
    </>
  );
}
