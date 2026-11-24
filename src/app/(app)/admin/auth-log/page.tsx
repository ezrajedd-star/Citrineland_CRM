import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, Pagination } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Sign-in log" };

export default async function AuthLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("audit:view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params, 50);
  const where: any = {
    ...(sp(params, "type") ? { type: sp(params, "type") } : {}),
    ...(sp(params, "q") ? { email: { contains: sp(params, "q"), mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([prisma.authEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), prisma.authEvent.count({ where })]);
  const variant = { SIGN_IN: "success", SIGN_IN_FAILED: "danger", SIGN_OUT: "secondary", FORCED_SIGN_OUT: "warning" } as const;
  return (
    <>
      <PageHeader title="Sign-in log" breadcrumbs={[{ href: "/admin", label: "Admin" }]} />
      <Card>
        <FilterBar
          basePath="/admin/auth-log"
          values={params}
          filters={[
            { type: "search", name: "q", placeholder: "Email" },
            { type: "select", name: "type", label: "Event", options: Object.keys(variant).map((k) => ({ value: k, label: k })) },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Event</TH>
              <TH>Email</TH>
              <TH>Provider</TH>
              <TH>Reason</TH>
              <TH>IP / agent</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</TD>
                <TD>
                  <Badge variant={variant[r.type]}>{r.type.replace(/_/g, " ").toLowerCase()}</Badge>
                </TD>
                <TD className="text-xs">{r.email ?? "—"}</TD>
                <TD className="text-xs">{r.provider ?? "—"}</TD>
                <TD className="text-xs">{r.reason ?? "—"}</TD>
                <TD className="max-w-xs truncate text-xs text-stone-500">
                  {r.ip} {r.userAgent}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/admin/auth-log" />
      </Card>
    </>
  );
}
