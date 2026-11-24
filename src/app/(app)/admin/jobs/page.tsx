import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatCard, EmptyState } from "@/components/app/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/app/confirm-action";
import { retryJob } from "@/server/actions/profile";
import { JOBS } from "@/worker/jobs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Background jobs" };

type JobRow = { id: string; name: string; state: string; created_on: Date; completed_on: Date | null; retry_count: number; output: any };

async function q<T>(sql: string): Promise<T[]> {
  try {
    return await prisma.$queryRawUnsafe<T[]>(sql);
  } catch {
    return [];
  }
}

export default async function JobsPage() {
  const user = await requirePermission("jobs:view");
  const [failed, counts, hb] = await Promise.all([
    q<JobRow>(`SELECT id::text, name, state::text, created_on, completed_on, retry_count, output FROM pgboss.job WHERE state = 'failed' UNION ALL SELECT id::text, name, state::text, created_on, completed_on, retry_count, output FROM pgboss.archive WHERE state = 'failed' ORDER BY created_on DESC LIMIT 100`),
    q<{ state: string; n: bigint }>(`SELECT state::text, count(*) AS n FROM pgboss.job GROUP BY state`),
    prisma.setting.findUnique({ where: { key: "worker.heartbeat" } }),
  ]);
  const hbAt = hb ? new Date(String((hb.value as any).at)) : null;
  const healthy = hbAt && Date.now() - hbAt.getTime() < 5 * 60_000;
  const c = Object.fromEntries(counts.map((x) => [x.state, Number(x.n)]));
  return (
    <>
      <PageHeader title="Background jobs" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="pg-boss queues processed by the worker container." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Worker" value={healthy ? "Healthy" : "Not running"} tone={healthy ? "good" : "danger"} sub={hbAt ? `last heartbeat ${formatDateTime(hbAt)}` : "no heartbeat yet"} />
        <StatCard label="Queued" value={c.created ?? 0} />
        <StatCard label="Active" value={c.active ?? 0} />
        <StatCard label="Retrying" value={c.retry ?? 0} tone={c.retry ? "warn" : undefined} />
        <StatCard label="Failed" value={failed.length} tone={failed.length ? "danger" : "good"} />
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Failed jobs</CardTitle>
        </CardHeader>
        {failed.length === 0 ? (
          <EmptyState title="No failed jobs" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Created</TH>
                <TH>Retries</TH>
                <TH>Error</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {failed.map((j) => (
                <TR key={j.id}>
                  <TD className="text-xs font-medium">{j.name}</TD>
                  <TD className="text-xs">{formatDateTime(j.created_on)}</TD>
                  <TD className="text-xs">{j.retry_count}</TD>
                  <TD className="max-w-md truncate text-xs text-red-700">{JSON.stringify(j.output?.message ?? j.output ?? "")}</TD>
                  <TD className="text-right">
                    {can(user, "jobs:manage") && (
                      <ActionButton action={retryJob} args={{ name: j.name, id: j.id }} successMessage="Retry queued">
                        Retry
                      </ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled jobs (Asia/Manila)</CardTitle>
        </CardHeader>
        <Table>
          <TBody>
            {Object.entries(JOBS).map(([name, j]) => (
              <TR key={name}>
                <TD className="text-xs font-medium">{name}</TD>
                <TD className="text-xs">
                  <code>{j.cron ?? "on demand"}</code>
                </TD>
                <TD className="text-xs text-muted-foreground">{j.description}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
