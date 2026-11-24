import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, Pagination, StatusBadge } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConfirmAction } from "@/components/app/confirm-action";
import { anonymize } from "@/server/actions/privacy";
import { formatDateTime } from "@/lib/format";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Data privacy" };

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("clients:export");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const where: any = { deletedAt: null, ...(q ? { OR: [{ normalizedName: { contains: q.toLowerCase() } }, { email: { contains: q, mode: "insensitive" } }] } : {}) };
  const [rows, total] = await Promise.all([prisma.client.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }), prisma.client.count({ where })]);
  return (
    <>
      <PageHeader title="Data privacy (RA 10173)" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="Respond to data subject requests: export everything held about a client, or anonymize them. Every export and anonymization is audited; every document download is in the audit log." />
      <Card className="mb-4">
        <CardContent className="pt-4 text-xs text-muted-foreground">
          Consent is captured with a timestamp on leads/clients (web form requires it). KYC documents are visible only to roles with <code>kyc:view</code>. Anonymization keeps transactions and payments for accounting/legal retention but strips personal identifiers and removes KYC files.
        </CardContent>
      </Card>
      <Card>
        <FilterBar basePath="/admin/privacy" values={params} filters={[{ type: "search", name: "q", placeholder: "Client name or email" }]} />
        <Table>
          <THead>
            <TR>
              <TH>Client</TH>
              <TH>Consent</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  {fullName(c)}
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </TD>
                <TD className="text-xs">{c.privacyConsent ? `Yes, ${formatDateTime(c.privacyConsentAt)}` : "Not recorded"}</TD>
                <TD>{c.anonymizedAt ? <StatusBadge status="DEACTIVATED" label="Anonymized" /> : <StatusBadge status="ACTIVE" label="Active" />}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/privacy/clients/${c.id}`}>Export JSON</a>
                    </Button>
                    {!c.anonymizedAt && (
                      <ConfirmAction action={anonymize} args={{ clientId: c.id, confirm: true }} title={`Anonymize ${fullName(c)}?`} description="This permanently removes personal data and KYC files. It cannot be undone." destructive variant="ghost">
                        Anonymize
                      </ConfirmAction>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/admin/privacy" />
      </Card>
    </>
  );
}
