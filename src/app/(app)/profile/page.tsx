import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { entraConfigured } from "@/lib/auth";
import { PageHeader, DL, StatusBadge } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton, ConfirmAction } from "@/components/app/confirm-action";
import { setEmailNotifications, syncMyMailbox, disconnectMicrosoft, connectMicrosoft } from "@/server/actions/profile";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [u, conn, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.microsoftConnection.findUnique({ where: { userId: user.id } }),
    prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expires: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Profile" description={`${u.name} · ${user.roleName}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Microsoft 365 / Outlook</CardTitle>
            <CardDescription>Used to send email from your mailbox, capture emails with clients and brokers, and create calendar events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DL
              items={[
                ["Status", <StatusBadge key="s" status={conn?.status ?? "DISCONNECTED"} label={conn ? undefined : "Not connected"} />],
                ["Mailbox", conn?.email ?? "—"],
                ["Last email sync", formatDateTime(conn?.lastMailSyncAt)],
                ["Last calendar sync", formatDateTime(conn?.lastCalendarSyncAt)],
              ]}
            />
            {conn?.lastError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">{conn.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              {entraConfigured ? (
                <form action={connectMicrosoft}>
                  <Button type="submit" size="sm">
                    {conn && conn.status === "CONNECTED" ? "Reconnect" : "Connect Microsoft 365"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">Microsoft 365 isn't configured on this server yet (see docs/MICROSOFT_SETUP.md).</p>
              )}
              {conn && conn.status !== "DISCONNECTED" && (
                <>
                  <ActionButton action={syncMyMailbox} args={{}} successMessage="Synced">
                    Sync now
                  </ActionButton>
                  <ConfirmAction action={disconnectMicrosoft} args={{}} title="Disconnect Microsoft 365?" description="Email capture and sending from the CRM stop until you reconnect." variant="ghost">
                    Disconnect
                  </ConfirmAction>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>In-app notifications always appear under the bell. You can also receive them in Outlook.</p>
            <ActionButton action={setEmailNotifications} args={{ enabled: !u.emailNotifications }} successMessage="">
              {u.emailNotifications ? "Turn off Outlook email notifications" : "Also email me notifications"}
            </ActionButton>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="py-2">
                  {s.provider} · {s.ip ?? "unknown IP"} · last seen {formatDateTime(s.lastSeenAt)} {s.id === user.sessionId && <StatusBadge status="ACTIVE" label="This session" />}
                  <div className="truncate text-xs text-muted-foreground">{s.userAgent}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
