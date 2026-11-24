import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, LinkTabs, DL, EmptyState, StatusBadge } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { AuditTable } from "@/components/app/audit-table";
import { Timeline } from "@/components/app/timeline";
import { TasksPanel } from "@/components/app/tasks-panel";
import { ComposeEmailButton } from "@/components/app/compose-email";
import { saveClient, deleteClient, saveClientParty, deleteClientParty } from "@/server/actions/crm";
import { clientFields, partyFields } from "@/components/forms/crm-fields";
import { userOptions, brokerOptions } from "@/server/queries/options";
import { label } from "@/lib/labels";
import { dayInput, formatDay, formatDateTime } from "@/lib/format";
import { formatPeso } from "@/lib/money";
import { formatPhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("clients:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "profile";
  const c = await prisma.client.findFirst({ where: { id, deletedAt: null }, include: { parties: true, broker: { include: { brokerage: true } }, owner: true, leads: { select: { id: true } } } });
  if (!c) notFound();
  const canEdit = can(user, "clients:update") && !c.anonymizedAt;
  const [users, brokers, txs] = await Promise.all([
    userOptions(),
    brokerOptions(),
    prisma.transaction.findMany({ where: { clientId: id, deletedAt: null }, include: { items: { include: { unit: true, parkingSlot: true } }, development: true }, orderBy: { reservedAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader
        title={c.anonymizedAt ? "Anonymized client" : fullName(c)}
        description={c.broker ? `Broker of record: ${fullName(c.broker)}${c.broker.brokerage ? ` (${c.broker.brokerage.name})` : ""}` : "Direct client"}
        breadcrumbs={[{ href: "/clients", label: "Clients" }]}
        actions={
          <>
            {c.email && !c.doNotEmail && <ComposeEmailButton to={[c.email]} clientId={c.id} />}
            {can(user, "transactions:create") && (
              <Button asChild size="sm">
                <Link href={`/transactions/new?clientId=${c.id}`}>New reservation</Link>
              </Button>
            )}
            {canEdit && (
              <FormDialog
                title="Edit client"
                triggerLabel="Edit"
                triggerVariant="outline"
                schema="client"
                wide
                fields={clientFields({ users, brokers })}
                action={saveClient}
                defaultValues={{ ...c, birthdate: dayInput(c.birthdate), monthlyIncome: c.monthlyIncomeCents ? Number(c.monthlyIncomeCents) / 100 : "" }}
              />
            )}
            {can(user, "clients:delete") && (
              <ConfirmAction action={deleteClient} args={{ id }} title="Delete this client?" description="Clients with active transactions can't be deleted." destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <LinkTabs
        baseHref={`/clients/${id}`}
        active={tab}
        tabs={[
          { key: "profile", label: "Profile" },
          { key: "parties", label: "Co-buyers / spouse", count: c.parties.length },
          { key: "documents", label: "KYC & documents" },
          { key: "timeline", label: "Timeline" },
          { key: "transactions", label: "Transactions", count: txs.length },
          { key: "tasks", label: "Tasks" },
          { key: "history", label: "History" },
        ]}
      />
      {tab === "profile" && (
        <Card>
          <CardContent className="pt-4">
            <DL
              cols={3}
              items={[
                ["Full legal name", fullName(c)],
                ["Birthdate", formatDay(c.birthdate)],
                ["Civil status", label(c.civilStatus)],
                ["Nationality", c.nationality],
                ["TIN", c.tin],
                ["Mobile", formatPhMobile(c.mobile)],
                ["Email", c.email],
                ["Address", [c.addressLine, c.city, c.province, c.zipCode].filter(Boolean).join(", ")],
                ["Employer", c.employer],
                ["Occupation", c.occupation],
                ["Monthly income", c.monthlyIncomeCents ? formatPeso(c.monthlyIncomeCents) : "—"],
                ["Owner", c.owner?.name],
                ["Privacy consent", c.privacyConsent ? `Yes, ${formatDateTime(c.privacyConsentAt)}` : "No"],
                ["Do not email", c.doNotEmail ? "Yes" : "No"],
                ["NetSuite customer", c.netsuiteId ?? "Not synced"],
              ]}
            />
            {c.notes && <p className="mt-4 whitespace-pre-wrap text-sm">{c.notes}</p>}
          </CardContent>
        </Card>
      )}
      {tab === "parties" && (
        <Card>
          <div className="flex justify-end border-b p-3">{canEdit && <FormDialog title="Add co-buyer / spouse" schema="clientParty" wide fields={partyFields} action={saveClientParty} defaultValues={{ clientId: id, relationship: c.civilStatus === "MARRIED" ? "SPOUSE" : "CO_BUYER" }} />}</div>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Relationship</TH>
                <TH>Birthdate</TH>
                <TH>TIN</TH>
                <TH>Contact</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {c.parties.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.fullName}</TD>
                  <TD>{label(p.relationship)}</TD>
                  <TD>{formatDay(p.birthdate)}</TD>
                  <TD>{p.tin ?? "—"}</TD>
                  <TD className="text-xs">{[formatPhMobile(p.mobile), p.email].filter((x) => x && x !== "—").join(" · ")}</TD>
                  <TD className="text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <FormDialog title="Edit" triggerLabel="Edit" triggerVariant="ghost" schema="clientParty" wide fields={partyFields} action={saveClientParty} defaultValues={{ ...p, birthdate: dayInput(p.birthdate) }} />
                        <ConfirmAction action={deleteClientParty} args={{ id: p.id }} title={`Remove ${p.fullName}?`} destructive variant="ghost">
                          Remove
                        </ConfirmAction>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {c.parties.length === 0 && <EmptyState title="No co-buyers" description="Add a spouse (required for married buyers) or co-buyers." />}
        </Card>
      )}
      {tab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            <DocumentsPanel
              entityType="Client"
              entityId={id}
              user={user}
              categories={["Other"]}
              kycCategories={["Government ID", "Proof of income", "TIN ID / BIR form", "Marriage certificate", "Proof of billing", "SPA / authorization"]}
            />
          </CardContent>
        </Card>
      )}
      {tab === "timeline" && (
        <Card>
          <CardContent className="pt-4">
            <Timeline filter={{ clientId: id }} canAdd={canEdit} />
          </CardContent>
        </Card>
      )}
      {tab === "transactions" && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Transaction</TH>
                <TH>Development</TH>
                <TH>Items</TH>
                <TH>Status</TH>
                <TH className="text-right">TCP</TH>
              </TR>
            </THead>
            <TBody>
              {txs.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/transactions/${t.id}`} className="font-medium text-brand-800 hover:underline">
                      {t.code}
                    </Link>
                    <div className="text-xs text-muted-foreground">{formatDay(t.reservedAt)}</div>
                  </TD>
                  <TD>{t.development.name}</TD>
                  <TD className="text-xs">{t.items.map((i) => i.unit?.code ?? i.parkingSlot?.code).join(", ")}</TD>
                  <TD>
                    <StatusBadge status={t.status} label={label(t.status)} />
                  </TD>
                  <TD className="text-right tabular">{formatPeso(t.tcpCents)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {txs.length === 0 && <EmptyState title="No transactions" />}
        </Card>
      )}
      {tab === "tasks" && (
        <Card>
          <CardContent className="pt-4">
            <TasksPanel filter={{ clientId: id }} />
          </CardContent>
        </Card>
      )}
      {tab === "history" && (
        <Card>
          <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Client", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
        </Card>
      )}
    </>
  );
}
