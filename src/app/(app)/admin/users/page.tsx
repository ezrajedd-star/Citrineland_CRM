import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, StatusBadge, Pagination } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { saveUser, setUserStatus, deleteUser, forceSignOut } from "@/server/actions/admin-users";
import { formatDateTime } from "@/lib/format";
import { formatPhMobile } from "@/lib/normalize";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePermission("users:view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const where = {
    deletedAt: null,
    type: "STAFF" as const,
    ...(sp(params, "roleId") ? { roleId: sp(params, "roleId") } : {}),
    ...(sp(params, "status") ? { status: sp(params, "status") as any } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [users, total, roles, sessions] = await Promise.all([
    prisma.user.findMany({ where, include: { role: true, microsoftConnection: { select: { status: true } } }, orderBy: { name: "asc" }, skip, take }),
    prisma.user.count({ where }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.session.groupBy({ by: ["userId"], where: { revokedAt: null, expires: { gt: new Date() } }, _count: true }),
  ]);
  const activeSessions = new Map(sessions.map((s) => [s.userId, s._count]));
  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  const fields: FieldDef[] = [
    { name: "id", label: "", type: "hidden" },
    { name: "name", label: "Full name", required: true, autoFocus: true },
    { name: "email", label: "Microsoft 365 email", type: "email", required: true, help: "Must match their company Microsoft account" },
    { name: "roleId", label: "Role", type: "select", options: roleOptions, required: true, emptyOption: false },
    { name: "status", label: "Status", type: "select", options: ["INVITED", "ACTIVE", "DEACTIVATED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })), emptyOption: false },
    { name: "phone", label: "Mobile", type: "tel", placeholder: "+63 917 123 4567" },
    { name: "emailNotifications", label: "Also send notifications to Outlook", type: "checkbox" },
  ];
  const canEdit = me.permissions.has("users:update");
  return (
    <>
      <PageHeader
        title="Users"
        description="Only users registered here can sign in with Microsoft."
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        actions={
          me.permissions.has("users:create") && (
            <FormDialog title="Invite user" schema="user" fields={fields} action={saveUser} defaultValues={{ status: "INVITED", roleId: roles.find((r) => r.key === "BNG_STAFF")?.id }} submitLabel="Invite" />
          )
        }
      />
      <Card>
        <FilterBar
          basePath="/admin/users"
          values={params}
          filters={[
            { type: "search", name: "q", placeholder: "Name or email" },
            { type: "select", name: "roleId", label: "Role", options: roleOptions },
            { type: "select", name: "status", label: "Status", options: ["INVITED", "ACTIVE", "DEACTIVATED"].map((s) => ({ value: s, label: s })) },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Microsoft 365</TH>
              <TH>Last sign-in</TH>
              <TH>Sessions</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.email}
                    {u.phone ? ` · ${formatPhMobile(u.phone)}` : ""}
                  </div>
                </TD>
                <TD>{u.role.name}</TD>
                <TD>
                  <StatusBadge status={u.status} />
                </TD>
                <TD>
                  <StatusBadge status={u.microsoftConnection?.status ?? "DISCONNECTED"} label={u.microsoftConnection ? undefined : "Not connected"} />
                </TD>
                <TD className="text-xs">{formatDateTime(u.lastLoginAt)}</TD>
                <TD className="tabular">{activeSessions.get(u.id) ?? 0}</TD>
                <TD>
                  {canEdit && u.id !== me.id && (
                    <div className="flex justify-end gap-1">
                      <FormDialog
                        title="Edit user"
                        triggerLabel="Edit"
                        triggerVariant="outline"
                        schema="user"
                        fields={fields}
                        action={saveUser}
                        defaultValues={{ id: u.id, name: u.name, email: u.email, roleId: u.roleId, status: u.status, phone: u.phone, emailNotifications: u.emailNotifications }}
                      />
                      {u.status !== "ACTIVE" ? (
                        <ConfirmAction action={setUserStatus} args={{ id: u.id, status: "ACTIVE" }} title={`Activate ${u.name}?`}>
                          Activate
                        </ConfirmAction>
                      ) : (
                        <ConfirmAction action={setUserStatus} args={{ id: u.id, status: "DEACTIVATED" }} title={`Deactivate ${u.name}?`} description="They will be signed out immediately and can no longer sign in." destructive>
                          Deactivate
                        </ConfirmAction>
                      )}
                      <ConfirmAction action={forceSignOut} args={{ id: u.id }} title={`Force sign-out ${u.name}?`} description="All of their active sessions will be invalidated.">
                        Sign out
                      </ConfirmAction>
                      {me.permissions.has("users:delete") && (
                        <ConfirmAction action={deleteUser} args={{ id: u.id }} title={`Delete ${u.name}?`} description="The user is removed and can no longer sign in. Their history is kept for auditing." destructive variant="ghost">
                          Delete
                        </ConfirmAction>
                      )}
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/admin/users" />
      </Card>
    </>
  );
}
