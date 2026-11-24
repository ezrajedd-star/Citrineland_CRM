import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, LinkTabs, DL } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { AuditTable } from "@/components/app/audit-table";
import { Timeline } from "@/components/app/timeline";
import { TasksPanel } from "@/components/app/tasks-panel";
import { ExpiryBadge } from "@/components/app/expiry";
import { BrokerPerformance } from "@/components/app/broker-performance";
import { BrokerLeads, BrokerTransactions, BrokerCommissions } from "@/components/app/broker-lists";
import { saveBroker, deleteBroker } from "@/server/actions/crm";
import { brokerFields } from "@/components/forms/crm-fields";
import { brokerageOptions } from "@/server/queries/options";
import { label } from "@/lib/labels";
import { dayInput, formatDateTime, formatDay } from "@/lib/format";
import { formatPhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export default async function BrokerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("brokers:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "profile";
  const b = await prisma.broker.findFirst({ where: { id, deletedAt: null }, include: { brokerage: true } });
  if (!b) notFound();
  const canEdit = can(user, "brokers:update");
  return (
    <>
      <PageHeader
        title={fullName(b)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {label(b.role)} · {b.brokerage ? <Link href={`/brokers/brokerages/${b.brokerage.id}`} className="hover:underline">{b.brokerage.name}</Link> : "Independent"} <StatusBadge status={b.accreditationStatus} />
          </span>
        }
        breadcrumbs={[{ href: "/brokers", label: "Brokers" }]}
        actions={
          <>
            {canEdit && (
              <FormDialog
                title="Edit broker"
                triggerLabel="Edit"
                triggerVariant="outline"
                schema="broker"
                wide
                fields={brokerFields(await brokerageOptions())}
                action={saveBroker}
                defaultValues={{ ...b, prcLicenseExpiry: dayInput(b.prcLicenseExpiry), accreditationDate: dayInput(b.accreditationDate), accreditationExpiry: dayInput(b.accreditationExpiry) }}
              />
            )}
            {can(user, "brokers:delete") && (
              <ConfirmAction action={deleteBroker} args={{ id, kind: "broker" }} title={`Delete ${fullName(b)}?`} destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <LinkTabs
        baseHref={`/brokers/${id}`}
        active={tab}
        tabs={[
          { key: "profile", label: "Profile & performance" },
          { key: "documents", label: "Documents" },
          { key: "leads", label: "Leads" },
          { key: "transactions", label: "Transactions" },
          { key: "commissions", label: "Commissions" },
          { key: "timeline", label: "Timeline" },
          { key: "tasks", label: "Tasks" },
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
                  ["Mobile", formatPhMobile(b.mobile)],
                  ["Email", b.email],
                  ["PRC license", b.prcLicenseNo],
                  ["PRC license expiry", <ExpiryBadge key="p" date={b.prcLicenseExpiry} />],
                  ["DHSUD registration", b.dhsudRegNo],
                  ["Accreditation", `${label(b.accreditationStatus)}${b.accreditationDate ? ` since ${formatDay(b.accreditationDate)}` : ""}`],
                  ["Accreditation expiry", <ExpiryBadge key="a" date={b.accreditationExpiry} />],
                  ["Commission override", b.commissionRateOverridePct != null ? `${b.commissionRateOverridePct}%` : "Uses commission rules"],
                  ["Added", formatDateTime(b.createdAt)],
                ]}
              />
              {b.notes && <p className="mt-4 whitespace-pre-wrap text-sm">{b.notes}</p>}
            </CardContent>
          </Card>
          <BrokerPerformance brokerId={id} />
        </div>
      )}
      {tab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            <DocumentsPanel entityType="Broker" entityId={id} user={user} categories={["PRC license", "PRC ID", "DHSUD registration", "Accreditation form", "Valid ID", "Other"]} />
          </CardContent>
        </Card>
      )}
      {tab === "leads" && <BrokerLeads brokerId={id} />}
      {tab === "transactions" && <BrokerTransactions where={{ brokerId: id }} />}
      {tab === "commissions" && <BrokerCommissions where={{ brokerId: id }} />}
      {tab === "timeline" && (
        <Card>
          <CardContent className="pt-4">
            <Timeline filter={{ brokerId: id }} canAdd={canEdit} />
          </CardContent>
        </Card>
      )}
      {tab === "tasks" && (
        <Card>
          <CardContent className="pt-4">
            <TasksPanel filter={{ brokerId: id }} />
          </CardContent>
        </Card>
      )}
      {tab === "history" && (
        <Card>
          <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Broker", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
        </Card>
      )}
    </>
  );
}

