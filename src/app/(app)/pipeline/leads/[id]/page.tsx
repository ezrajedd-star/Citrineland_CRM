import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, LinkTabs, DL, EmptyState, StatusBadge } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { AuditTable } from "@/components/app/audit-table";
import { Timeline } from "@/components/app/timeline";
import { TasksPanel } from "@/components/app/tasks-panel";
import { ComposeEmailButton } from "@/components/app/compose-email";
import { saveLead, deleteLead, overrideBroker, moveStage, convertToClient } from "@/server/actions/crm";
import { leadFields } from "@/components/forms/crm-fields";
import { findDuplicates } from "@/server/duplicates";
import { leadScope } from "@/server/leads";
import { picklist, picklistLabel } from "@/lib/picklists";
import { userOptions, brokerOptions, developmentOptions, campaignOptions } from "@/server/queries/options";
import { label } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { formatPeso } from "@/lib/money";
import { formatPhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("leads:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...leadScope(user) },
    include: { stage: true, broker: { include: { brokerage: true } }, owner: true, campaign: true, developments: true, client: true },
  });
  if (!lead) notFound();
  const [sources, campaigns, developments, users, brokers, stages, lostReasons, sourceLabels, lostLabels, dups, computations, holds] = await Promise.all([
    picklist("LEAD_SOURCE"),
    campaignOptions(),
    developmentOptions(),
    userOptions(),
    brokerOptions(),
    prisma.pipelineStage.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    picklist("LOST_REASON"),
    picklistLabel("LEAD_SOURCE"),
    picklistLabel("LOST_REASON"),
    findDuplicates({ firstName: lead.firstName, lastName: lead.lastName, email: lead.email, mobile: lead.mobile, excludeLeadId: lead.id, excludeClientId: lead.clientId }),
    prisma.sampleComputation.findMany({ where: { leadId: id }, include: { unit: true, parkingSlot: true, paymentScheme: true }, orderBy: { createdAt: "desc" } }),
    prisma.hold.findMany({ where: { leadId: id }, include: { unit: true, parkingSlot: true, placedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const canEdit = can(user, "leads:update");
  const transactions = await prisma.transaction.findMany({ where: { leadId: id }, select: { id: true, code: true, status: true } });
  return (
    <>
      <PageHeader
        title={fullName(lead)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: lead.stage.color }} />
              {lead.stage.name}
            </span>
            · {sourceLabels.get(lead.sourceCode) ?? lead.sourceCode}
            {lead.doNotEmail && <StatusBadge status="BLOCKED" label="Do not email" />}
            {lead.stage.isLost && lead.lostReasonCode && <span className="text-red-700">Lost: {lostLabels.get(lead.lostReasonCode) ?? lead.lostReasonCode}</span>}
          </span>
        }
        breadcrumbs={[{ href: "/pipeline", label: "Pipeline" }]}
        actions={
          <>
            {lead.email && !lead.doNotEmail && <ComposeEmailButton to={[lead.email]} leadId={lead.id} />}
            {can(user, "computations:create") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/computations/new?leadId=${lead.id}`}>Sample computation</Link>
              </Button>
            )}
            {can(user, "transactions:create") && !lead.stage.isWon && (
              <Button asChild size="sm">
                <Link href={`/transactions/new?leadId=${lead.id}`}>Reserve a unit</Link>
              </Button>
            )}
            {canEdit && (
              <FormDialog
                title="Edit lead"
                triggerLabel="Edit"
                triggerVariant="outline"
                schema="lead"
                wide
                action={saveLead}
                fields={leadFields({ sources, campaigns, developments, users, brokers, stages: [], isNew: false, canPickBroker: !lead.brokerId })}
                defaultValues={{
                  ...lead,
                  developmentIds: lead.developments.map((d) => d.id),
                  budgetMin: lead.budgetMinCents ? Number(lead.budgetMinCents) / 100 : "",
                  budgetMax: lead.budgetMaxCents ? Number(lead.budgetMaxCents) / 100 : "",
                }}
              />
            )}
            {can(user, "leads:delete") && (
              <ConfirmAction action={deleteLead} args={{ id }} title={`Delete ${fullName(lead)}?`} destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      {dups.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" /> Possible duplicates
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {dups.map((d) => (
              <li key={d.kind + d.id}>
                <Link className="underline" href={d.kind === "lead" ? `/pipeline/leads/${d.id}` : `/clients/${d.id}`}>
                  {d.name}
                </Link>{" "}
                ({d.kind}
                {d.stage ? `, ${d.stage}` : ""}) — matched on {d.matchedOn.join(", ")} · broker of record: <b>{d.brokerOfRecord ?? "none"}</b>
                {d.owner ? ` · owner ${d.owner}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit && !lead.stage.isWon ? (
              <FormDialog
                title="Move stage"
                triggerLabel={`Move from “${lead.stage.name}”`}
                triggerVariant="outline"
                schema="moveStage"
                columns={1}
                action={moveStage}
                defaultValues={{ leadId: lead.id, stageId: lead.stageId }}
                fields={[
                  { name: "leadId", label: "", type: "hidden" },
                  { name: "stageId", label: "New stage", type: "select", emptyOption: false, options: stages.filter((s) => !s.isWon).map((s) => ({ value: s.id, label: `${s.name}${s.isLost ? " (lost)" : ""}` })) },
                  { name: "lostReasonCode", label: "Lost reason (if lost)", type: "select", options: lostReasons },
                  { name: "lostNotes", label: "Notes", type: "textarea" },
                ]}
              />
            ) : (
              <p className="text-sm">{lead.stage.name}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">In stage since {formatDateTime(lead.stageChangedAt)}. To win, reserve a unit.</p>
            {transactions.map((t) => (
              <Link key={t.id} href={`/transactions/${t.id}`} className="mt-1 block text-sm text-brand-700 hover:underline">
                {t.code} · {label(t.status)}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Broker of record</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.broker ? (
              <div className="text-sm">
                <Link href={`/brokers/${lead.broker.id}`} className="font-medium text-brand-800 hover:underline">
                  {fullName(lead.broker)}
                </Link>
                <div className="text-xs text-muted-foreground">{lead.broker.brokerage?.name ?? "Independent"}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None (direct)</p>
            )}
            {can(user, "leads:override_broker") && (lead.brokerId || true) && (
              <div className="mt-2">
                <FormDialog
                  title="Override broker of record"
                  description="Citrineland decides attribution. The change and reason are written to the audit log and the lead's timeline."
                  triggerLabel={lead.brokerId ? "Override broker" : "Assign broker"}
                  triggerVariant="outline"
                  schema="overrideBroker"
                  columns={1}
                  action={overrideBroker}
                  defaultValues={{ leadId: lead.id, brokerId: lead.brokerId }}
                  fields={[
                    { name: "leadId", label: "", type: "hidden" },
                    { name: "brokerId", label: "New broker of record", type: "select", options: brokers, emptyOption: "— none / direct —" },
                    { name: "reason", label: "Reason", type: "textarea", required: true },
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Client record</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.client ? (
              <Link href={`/clients/${lead.client.id}`} className="text-sm font-medium text-brand-800 hover:underline">
                {fullName(lead.client)}
              </Link>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Created automatically at reservation.</p>
                {can(user, "clients:create") && (
                  <div className="mt-2">
                    <ConfirmAction action={convertToClient} args={{ leadId: lead.id }} title="Create a client record from this lead?">
                      Convert to client now
                    </ConfirmAction>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <LinkTabs
        baseHref={`/pipeline/leads/${id}`}
        active={tab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "timeline", label: "Timeline" },
          { key: "tasks", label: "Tasks" },
          { key: "computations", label: "Computations", count: computations.length },
          { key: "holds", label: "Holds", count: holds.length },
          { key: "documents", label: "Documents" },
          { key: "history", label: "History" },
        ]}
      />
      {tab === "overview" && (
        <Card>
          <CardContent className="pt-4">
            <DL
              cols={3}
              items={[
                ["Mobile", formatPhMobile(lead.mobile)],
                ["Email", lead.email],
                ["Owner", lead.owner?.name ?? "Unassigned"],
                ["Developments of interest", lead.developments.map((d) => d.name).join(", ") || "—"],
                ["Unit type", label(lead.unitTypePref)],
                ["Financing", label(lead.financingPref)],
                ["Budget", lead.budgetMinCents || lead.budgetMaxCents ? `${lead.budgetMinCents ? formatPeso(lead.budgetMinCents) : "—"} to ${lead.budgetMaxCents ? formatPeso(lead.budgetMaxCents) : "—"}` : "—"],
                ["Campaign", lead.campaign?.name],
                ["UTM", [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ") || "—"],
                ["Privacy consent", lead.privacyConsent ? `Yes, ${formatDateTime(lead.privacyConsentAt)}` : "No"],
                ["Last activity", formatDateTime(lead.lastActivityAt)],
                ["Created", formatDateTime(lead.createdAt)],
              ]}
            />
            {lead.notes && <p className="mt-4 whitespace-pre-wrap text-sm">{lead.notes}</p>}
          </CardContent>
        </Card>
      )}
      {tab === "timeline" && (
        <Card>
          <CardContent className="pt-4">
            <Timeline filter={{ leadId: id }} canAdd={canEdit} />
          </CardContent>
        </Card>
      )}
      {tab === "tasks" && (
        <Card>
          <CardContent className="pt-4">
            <TasksPanel filter={{ leadId: id }} />
          </CardContent>
        </Card>
      )}
      {tab === "computations" && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Version</TH>
                <TH>Item</TH>
                <TH>Scheme</TH>
                <TH className="text-right">TCP</TH>
                <TH>Valid until</TH>
                <TH>Sent</TH>
              </TR>
            </THead>
            <TBody>
              {computations.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/computations/${c.id}`} className="font-medium text-brand-800 hover:underline">
                      v{c.version}
                    </Link>
                  </TD>
                  <TD className="text-xs">{[c.unit?.code, c.parkingSlot?.code].filter(Boolean).join(" + ")}</TD>
                  <TD className="text-xs">{c.paymentScheme.name}</TD>
                  <TD className="text-right tabular">{formatPeso(c.tcpCents)}</TD>
                  <TD className="text-xs">{formatDateTime(c.validUntil)}</TD>
                  <TD className="text-xs">{c.sentAt ? formatDateTime(c.sentAt) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {computations.length === 0 && <EmptyState title="No computations yet" />}
        </Card>
      )}
      {tab === "holds" && (
        <Card>
          <Table>
            <TBody>
              {holds.map((h) => (
                <TR key={h.id}>
                  <TD>{h.unit?.code ?? h.parkingSlot?.code}</TD>
                  <TD>
                    <StatusBadge status={h.status === "ACTIVE" ? "ON_HOLD" : h.status === "CONVERTED" ? "RESERVED" : "EXPIRED"} label={label(h.status)} />
                  </TD>
                  <TD className="text-xs">by {h.placedBy.name}</TD>
                  <TD className="text-xs">expires {formatDateTime(h.expiresAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {holds.length === 0 && <EmptyState title="No holds" />}
        </Card>
      )}
      {tab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            <DocumentsPanel entityType="Lead" entityId={id} user={user} categories={["Inquiry form", "Valid ID", "Other"]} />
          </CardContent>
        </Card>
      )}
      {tab === "history" && (
        <Card>
          <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Lead", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
        </Card>
      )}
    </>
  );
}
