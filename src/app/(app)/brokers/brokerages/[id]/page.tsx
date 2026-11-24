import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, LinkTabs, DL } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { AuditTable } from "@/components/app/audit-table";
import { ExpiryBadge } from "@/components/app/expiry";
import { BrokerPerformance } from "@/components/app/broker-performance";
import { BrokerTransactions, BrokerCommissions } from "@/components/app/broker-lists";
import { saveBrokerage, saveBroker, deleteBroker } from "@/server/actions/crm";
import { brokerageFields, brokerFields } from "@/components/forms/crm-fields";
import { label } from "@/lib/labels";
import { dayInput, formatDay } from "@/lib/format";
import { formatPhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export default async function BrokeragePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("brokers:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "profile";
  const b = await prisma.brokerage.findFirst({ where: { id, deletedAt: null }, include: { brokers: { where: { deletedAt: null }, orderBy: { lastName: "asc" } } } });
  if (!b) notFound();
  const canEdit = can(user, "brokers:update");
  return (
    <>
      <PageHeader
        title={b.name}
        description={<StatusBadge status={b.accreditationStatus} />}
        breadcrumbs={[{ href: "/brokers?tab=brokerages", label: "Brokerages" }]}
        actions={
          <>
            {canEdit && <FormDialog title="Add broker" triggerVariant="outline" schema="broker" wide fields={brokerFields([{ value: b.id, label: b.name }])} action={saveBroker} defaultValues={{ brokerageId: b.id, accreditationStatus: "PENDING", role: "SALESPERSON" }} />}
            {canEdit && (
              <FormDialog
                title="Edit brokerage"
                triggerLabel="Edit"
                triggerVariant="outline"
                schema="brokerage"
                wide
                fields={brokerageFields()}
                action={saveBrokerage}
                defaultValues={{ ...b, accreditationDate: dayInput(b.accreditationDate), accreditationExpiry: dayInput(b.accreditationExpiry) }}
              />
            )}
            {can(user, "brokers:delete") && (
              <ConfirmAction action={deleteBroker} args={{ id, kind: "brokerage" }} title={`Delete ${b.name}?`} destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <LinkTabs
        baseHref={`/brokers/brokerages/${id}`}
        active={tab}
        tabs={[
          { key: "profile", label: "Profile & performance" },
          { key: "brokers", label: "Brokers", count: b.brokers.length },
          { key: "documents", label: "Documents" },
          { key: "transactions", label: "Transactions" },
          { key: "commissions", label: "Commissions" },
          { key: "history", label: "History" },
        ]}
      />
      {tab === "profile" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <DL
                cols={3}
                items={[
                  ["Contact person", b.contactPerson],
                  ["Phone", b.phone],
                  ["Email", b.email],
                  ["Address", [b.address, b.city].filter(Boolean).join(", ")],
                  ["TIN", b.tin],
                  ["Default commission", b.defaultCommissionPct != null ? `${b.defaultCommissionPct}%` : "—"],
                  ["Accreditation", `${label(b.accreditationStatus)}${b.accreditationDate ? ` since ${formatDay(b.accreditationDate)}` : ""}`],
                  ["Accreditation expiry", <ExpiryBadge key="e" date={b.accreditationExpiry} />],
                  ["NetSuite vendor", b.netsuiteId ?? "Not synced"],
                ]}
              />
            </CardContent>
          </Card>
          <BrokerPerformance brokerageId={id} />
        </div>
      )}
      {tab === "brokers" && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Contact</TH>
                <TH>Accreditation</TH>
                <TH>PRC expiry</TH>
              </TR>
            </THead>
            <TBody>
              {b.brokers.map((x) => (
                <TR key={x.id}>
                  <TD>
                    <Link href={`/brokers/${x.id}`} className="font-medium text-brand-800 hover:underline">
                      {fullName(x)}
                    </Link>
                  </TD>
                  <TD className="text-xs">{label(x.role)}</TD>
                  <TD className="text-xs">{[formatPhMobile(x.mobile), x.email].filter((v) => v && v !== "—").join(" · ")}</TD>
                  <TD>
                    <StatusBadge status={x.accreditationStatus} />
                  </TD>
                  <TD>
                    <ExpiryBadge date={x.prcLicenseExpiry} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {tab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            <DocumentsPanel entityType="Brokerage" entityId={id} user={user} categories={["Accreditation agreement", "Business permit", "SEC/DTI registration", "BIR 2303", "Other"]} />
          </CardContent>
        </Card>
      )}
      {tab === "transactions" && <BrokerTransactions where={{ brokerageId: id }} />}
      {tab === "commissions" && <BrokerCommissions where={{ brokerageId: id }} />}
      {tab === "history" && (
        <Card>
          <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Brokerage", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
        </Card>
      )}
    </>
  );
}
