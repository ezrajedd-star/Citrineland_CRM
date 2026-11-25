import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { entraConfigured } from "@/lib/auth";
import { storageMode } from "@/lib/storage";
import { PageHeader, StatusBadge, DL } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConfirmAction } from "@/components/app/confirm-action";
import { disconnectMicrosoft } from "@/server/actions/profile";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requirePermission("integrations:view");
  const [conns, users] = await Promise.all([
    prisma.microsoftConnection.findMany({ include: { user: { select: { name: true, email: true } } } }),
    prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE", type: "STAFF" }, select: { id: true, name: true, email: true } }),
  ]);
  const byUser = new Map(conns.map((c) => [c.userId, c]));
  return (
    <>
      <PageHeader title="Integrations" breadcrumbs={[{ href: "/admin", label: "Admin" }]} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Microsoft 365 (Entra ID + Graph)</CardTitle>
            <CardDescription>SSO, Outlook send, email capture, calendar sync</CardDescription>
          </CardHeader>
          <CardContent>
            <DL
              cols={2}
              items={[
                ["App registration", entraConfigured ? <Badge key="a" variant="success">Configured</Badge> : <Badge key="a" variant="warning">Not configured</Badge>],
                ["Connected mailboxes", `${conns.filter((c) => c.status === "CONNECTED").length} / ${users.length}`],
                ["With errors", conns.filter((c) => c.status === "ERROR").length],
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Oracle NetSuite</CardTitle>
            <CardDescription>Accounting sync for customers, sales orders, payments and broker vendor bills</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant="secondary">Not connected — coming soon</Badge>
            <p className="text-xs text-muted-foreground">Payments are recorded manually or by CSV for now. See docs/NETSUITE_INTEGRATION_PLAN.md.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>File storage</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {storageMode === "spaces" ? <Badge variant="success">DigitalOcean Spaces</Badge> : storageMode === "database" ? <Badge variant="warning">Database (free-tier demo)</Badge> : <Badge variant="warning">Local disk (dev only)</Badge>}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Status</TH>
              <TH>Mailbox</TH>
              <TH>Last email sync</TH>
              <TH>Last calendar sync</TH>
              <TH>Error</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {users.map((u) => {
              const c = byUser.get(u.id);
              return (
                <TR key={u.id}>
                  <TD>{u.name}</TD>
                  <TD>
                    <StatusBadge status={c?.status ?? "DISCONNECTED"} label={c ? undefined : "Not connected"} />
                  </TD>
                  <TD className="text-xs">{c?.email ?? "—"}</TD>
                  <TD className="text-xs">{formatDateTime(c?.lastMailSyncAt)}</TD>
                  <TD className="text-xs">{formatDateTime(c?.lastCalendarSyncAt)}</TD>
                  <TD className="max-w-xs truncate text-xs text-red-700">{c?.lastError}</TD>
                  <TD className="text-right">
                    {c && c.status !== "DISCONNECTED" && can(user, "integrations:manage") && (
                      <ConfirmAction action={disconnectMicrosoft} args={{ userId: u.id }} title={`Disconnect ${u.name}'s mailbox?`} variant="ghost">
                        Disconnect
                      </ConfirmAction>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <p className="p-3 text-xs text-muted-foreground">Users connect by signing in with Microsoft. Tokens are encrypted at rest (AES-256-GCM).</p>
      </Card>
    </>
  );
}
