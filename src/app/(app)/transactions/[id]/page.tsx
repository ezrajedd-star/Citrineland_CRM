import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, LinkTabs, DL, StatCard, EmptyState } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { AuditTable } from "@/components/app/audit-table";
import { Timeline } from "@/components/app/timeline";
import { TasksPanel } from "@/components/app/tasks-panel";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { UploadForm } from "@/components/app/upload-form";
import { ComposeEmailButton } from "@/components/app/compose-email";
import { ComputationView } from "@/components/transactions/computation-view";
import { CommissionLedgerPanel } from "@/components/transactions/commission-ledger";
import { changeStatus, cancel, transfer, addPayment, voidPaymentAction, updateChecklistItem, deleteTransaction } from "@/server/actions/transactions";
import { collectionSummary, macedaPreview } from "@/server/transactions";
import { allowedNextStatuses, canCancel, canTransfer } from "@/domain/transactions/state-machine";
import { MACEDA_DISCLAIMER } from "@/domain/maceda";
import type { ComputationResult } from "@/domain/pricing/computation";
import { clientOptions } from "@/server/queries/options";
import { formatPeso, n } from "@/lib/money";
import { formatDay, formatDateTime, dayInput, manilaToday } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { E } from "@/lib/validation/schemas";
import { fullName, cn } from "@/lib/utils";

export default async function TransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("transactions:view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "summary";
  const t = await prisma.transaction.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: { include: { parties: true } },
      broker: { include: { brokerage: true } },
      brokerage: true,
      handlingStaff: { select: { name: true } },
      development: true,
      paymentScheme: true,
      items: { include: { unit: true, parkingSlot: true } },
      statusLogs: { orderBy: { createdAt: "desc" } },
      transferredTo: { select: { id: true, code: true } },
      transferredFrom: { select: { id: true, code: true } },
      lead: { select: { id: true } },
    },
  });
  if (!t) notFound();
  const [schedule, payments, docs, summary] = await Promise.all([
    prisma.scheduleItem.findMany({ where: { transactionId: id }, orderBy: { seq: "asc" } }),
    prisma.payment.findMany({ where: { transactionId: id }, orderBy: { paidAt: "desc" } }),
    prisma.transactionDocument.findMany({ where: { transactionId: id }, include: { document: true }, orderBy: { order: "asc" } }),
    collectionSummary(id),
  ]);
  const closed = t.status === "CANCELLED" || t.status === "TRANSFERRED";
  const next = allowedNextStatuses(t.status);
  const maceda = can(user, "transactions:cancel") && canCancel(t.status) ? await macedaPreview(id) : null;
  const pricing = t.pricingSnapshot as unknown as ComputationResult;
  const today = dayInput(manilaToday());
  const pendingDocs = docs.filter((d) => d.required && d.status !== "VERIFIED").length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t.code} <StatusBadge status={t.status} label={label(t.status)} />
          </span>
        }
        description={
          <>
            <Link href={`/clients/${t.clientId}`} className="hover:underline">
              {fullName(t.client)}
            </Link>{" "}
            · {t.development.name} · {t.items.map((i) => i.unit?.code ?? i.parkingSlot?.code).join(" + ")}
            {t.transferredTo && (
              <>
                {" "}
                · transferred to{" "}
                <Link className="text-brand-700 underline" href={`/transactions/${t.transferredTo.id}`}>
                  {t.transferredTo.code}
                </Link>
              </>
            )}
            {t.transferredFrom && (
              <>
                {" "}
                · transferred from{" "}
                <Link className="text-brand-700 underline" href={`/transactions/${t.transferredFrom.id}`}>
                  {t.transferredFrom.code}
                </Link>
              </>
            )}
          </>
        }
        breadcrumbs={[{ href: "/transactions", label: "Transactions" }]}
        actions={
          <>
            {t.client.email && !t.client.doNotEmail && <ComposeEmailButton to={[t.client.email]} transactionId={t.id} clientId={t.clientId} />}
            {can(user, "transactions:update") &&
              next.map((s) => (
                <FormDialog
                  key={s}
                  title={`Move to ${label(s)}`}
                  triggerLabel={`→ ${label(s)}`}
                  triggerVariant="outline"
                  schema="statusChange"
                  columns={1}
                  action={changeStatus}
                  defaultValues={{ transactionId: t.id, toStatus: s, effectiveDate: today }}
                  description={s === "CONTRACT_SIGNED" ? "Inventory will be marked SOLD." : undefined}
                  fields={[
                    { name: "transactionId", label: "", type: "hidden" },
                    { name: "toStatus", label: "", type: "hidden" },
                    { name: "effectiveDate", label: "Effective date", type: "date" },
                    { name: "note", label: "Note", type: "textarea" },
                  ]}
                />
              ))}
            {can(user, "transactions:transfer") && canTransfer(t.status) && (
              <FormDialog
                title="Transfer / swap"
                triggerLabel="Transfer"
                triggerVariant="outline"
                description="Move this sale to another unit and/or another buyer. Payments carry over to the new transaction."
                schema="transfer"
                columns={1}
                action={transfer}
                defaultValues={{ transactionId: t.id }}
                fields={[
                  { name: "transactionId", label: "", type: "hidden" },
                  {
                    name: "newUnitId",
                    label: "New unit (same development)",
                    type: "select",
                    emptyOption: "— keep current unit —",
                    options: (await prisma.unit.findMany({ where: { developmentId: t.developmentId, status: "AVAILABLE", deletedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, listPriceCents: true } })).map((u) => ({
                      value: u.id,
                      label: `${u.code} · ${formatPeso(u.listPriceCents)}`,
                    })),
                  },
                  { name: "newClientId", label: "New buyer", type: "select", emptyOption: "— keep current buyer —", options: await clientOptions() },
                  { name: "reason", label: "Reason", type: "textarea", required: true },
                ]}
              />
            )}
            {maceda && (
              <FormDialog
                title={`Cancel ${t.code}`}
                triggerLabel="Cancel"
                triggerVariant="destructive"
                destructive
                submitLabel="Cancel transaction"
                schema="cancel"
                columns={1}
                action={cancel}
                defaultValues={{ transactionId: t.id }}
                description={`Units/slots return to AVAILABLE and unreleased commission tranches are forfeited. Indicative Maceda (RA 6552): ${maceda.applicable ? `${maceda.cashSurrenderPct}% of ${formatPeso(maceda.totalPaidCents)} = ${formatPeso(maceda.cashSurrenderValueCents)}` : "not applicable"} — for legal/finance review.`}
                fields={[
                  { name: "transactionId", label: "", type: "hidden" },
                  { name: "reason", label: "Cancellation reason", type: "textarea", required: true },
                  { name: "confirm", label: "I understand this releases the inventory", type: "checkbox" },
                ]}
              />
            )}
            {can(user, "transactions:delete") && closed && (
              <ConfirmAction action={deleteTransaction} args={{ id }} title={`Delete ${t.code}?`} destructive variant="ghost">
                Delete
              </ConfirmAction>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="TCP" value={formatPeso(t.tcpCents)} />
        <StatCard label="Collected" value={formatPeso(summary.paidCents)} sub={`${summary.paidPct.toFixed(1)}% of schedule`} />
        <StatCard label="Arrears" value={formatPeso(summary.arrearsCents)} tone={summary.arrearsCents > 0 ? "danger" : "good"} />
        <StatCard label="Next due" value={summary.nextDue ? formatPeso(summary.nextDue.remainingCents) : "—"} sub={summary.nextDue ? formatDay(summary.nextDue.dueDate) : "Fully paid"} />
        <StatCard label="Documents pending" value={pendingDocs} tone={pendingDocs ? "warn" : "good"} href={`/transactions/${id}?tab=documents`} />
      </div>
      <LinkTabs
        baseHref={`/transactions/${id}`}
        active={tab}
        tabs={[
          { key: "summary", label: "Summary" },
          { key: "payments", label: "Schedule & payments" },
          { key: "documents", label: "Documentation", count: docs.length },
          { key: "commission", label: "Commission" },
          { key: "timeline", label: "Timeline" },
          { key: "tasks", label: "Tasks" },
          { key: "history", label: "History" },
        ]}
      />
      {tab === "summary" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Price snapshot at reservation</CardTitle>
            </CardHeader>
            <CardContent>
              <ComputationView c={pricing} />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Parties</CardTitle>
              </CardHeader>
              <CardContent>
                <DL
                  cols={2}
                  items={[
                    ["Buyer", <Link key="b" href={`/clients/${t.clientId}`} className="text-brand-800 hover:underline">{fullName(t.client)}</Link>],
                    ["Co-buyers", t.client.parties.map((p) => `${p.fullName} (${label(p.relationship)})`).join(", ") || "—"],
                    ["Broker of record", t.broker ? <Link key="br" href={`/brokers/${t.broker.id}`} className="text-brand-800 hover:underline">{fullName(t.broker)}</Link> : "Direct"],
                    ["Brokerage", t.brokerage?.name ?? (t.broker ? "Independent" : "—")],
                    ["Handling staff", t.handlingStaff?.name],
                    ["Scheme", t.paymentScheme.name],
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <Table>
                <TBody>
                  {t.items.map((i) => (
                    <TR key={i.id} className={i.active ? "" : "opacity-50"}>
                      <TD>
                        <Link className="text-brand-800 hover:underline" href={i.unitId ? `/inventory/units/${i.unitId}` : `/inventory/parking/${i.parkingSlotId}`}>
                          {i.unit?.code ?? i.parkingSlot?.code}
                        </Link>
                        <div className="text-xs text-muted-foreground">{i.unit ? `${label(i.unit.unitType)} ${i.unit.model ?? ""}` : `Parking ${label(i.parkingSlot?.type)}`}</div>
                      </TD>
                      <TD className="text-right tabular">
                        {formatPeso(i.listPriceCents)}
                        <div className="text-xs text-muted-foreground">price list v{i.priceListVersion ?? "—"}</div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Key dates</CardTitle>
              </CardHeader>
              <CardContent>
                <DL
                  cols={2}
                  items={[
                    ["Reserved", formatDay(t.reservedAt)],
                    ["Contract signed", formatDay(t.contractSignedAt)],
                    ["DP complete", formatDay(t.dpCompletedAt)],
                    ["Fully paid", formatDay(t.fullyPaidAt)],
                    ["Turned over", formatDay(t.turnedOverAt)],
                    ["Titled", formatDay(t.titledAt)],
                    ...(t.cancelledAt ? ([["Cancelled", `${formatDay(t.cancelledAt)} — ${t.cancelReason}`]] as [string, string][]) : []),
                  ]}
                />
              </CardContent>
            </Card>
            {(t.macedaSnapshot || maceda) && (
              <Card>
                <CardHeader>
                  <CardTitle>Maceda Law (RA 6552) — indicative</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {(() => {
                    const m = (t.macedaSnapshot as any) ?? maceda;
                    return (
                      <>
                        <p>{m.basis}</p>
                        <p className="mt-1">
                          Cash surrender value: <b>{formatPeso(m.cashSurrenderValueCents)}</b> ({m.cashSurrenderPct}% of {formatPeso(m.totalPaidCents)})
                        </p>
                        <p>Grace period: {m.gracePeriod.months ? `${m.gracePeriod.months} month(s)` : `${m.gracePeriod.days} days`}</p>
                        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                          {m.notes.map((x: string) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs font-medium text-amber-800">{MACEDA_DISCLAIMER}</p>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === "payments" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-semibold">Payment schedule</span>
              <span className="text-xs text-muted-foreground">Payments are applied oldest-due first</span>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Description</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {schedule.map((s) => {
                  const bal = n(s.amountCents) - n(s.paidCents);
                  const overdue = bal > 0 && s.dueDate < manilaToday();
                  return (
                    <TR key={s.id} className={cn(overdue && "bg-red-50/60")}>
                      <TD className="text-xs">{s.seq}</TD>
                      <TD className="text-xs">
                        {s.label}
                        {s.interestCents ? <div className="text-muted-foreground">principal {formatPeso(s.principalCents)} · interest {formatPeso(s.interestCents)}</div> : null}
                      </TD>
                      <TD className="text-xs">{formatDay(s.dueDate)}</TD>
                      <TD className="text-right tabular">{formatPeso(s.amountCents)}</TD>
                      <TD className="text-right tabular">{formatPeso(s.paidCents)}</TD>
                      <TD className="text-right tabular">{formatPeso(bal)}</TD>
                      <TD>{bal <= 0 ? <StatusBadge status="DONE" label="Paid" /> : overdue ? <StatusBadge status="ERROR" label="Overdue" /> : n(s.paidCents) > 0 ? <StatusBadge status="IN_PROGRESS" label="Partial" /> : <StatusBadge status="NOT_DUE" label="Upcoming" />}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <Card>
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-semibold">Payments received</span>
              {can(user, "payments:create") && !closed && (
                <FormDialog
                  title="Record payment"
                  schema="payment"
                  action={addPayment}
                  defaultValues={{ transactionId: t.id, paidAt: today, method: "BANK_TRANSFER", amount: summary.nextDue ? (summary.nextDue.remainingCents / 100).toFixed(2) : "" }}
                  fields={[
                    { name: "transactionId", label: "", type: "hidden" },
                    { name: "paidAt", label: "Date received", type: "date", required: true },
                    { name: "amount", label: "Amount", type: "money", required: true },
                    { name: "orNumber", label: "OR number" },
                    { name: "method", label: "Method", type: "select", options: options(E.PaymentMethod), emptyOption: false },
                    { name: "reference", label: "Reference (check no., bank ref.)" },
                    { name: "notes", label: "Notes", type: "textarea", span: 2 },
                  ]}
                />
              )}
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>OR no.</TH>
                  <TH>Method</TH>
                  <TH>Source</TH>
                  <TH>Notes</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id} className={p.voidedAt ? "line-through opacity-50" : ""}>
                    <TD className="text-xs">{formatDay(p.paidAt)}</TD>
                    <TD className="text-right tabular">{formatPeso(p.amountCents)}</TD>
                    <TD className="text-xs">{p.orNumber ?? "—"}</TD>
                    <TD className="text-xs">{label(p.method)}</TD>
                    <TD className="text-xs">{p.source}</TD>
                    <TD className="text-xs text-muted-foreground">{p.voidedAt ? `Voided: ${p.voidReason}` : (p.notes ?? p.reference)}</TD>
                    <TD className="text-right">
                      {can(user, "payments:void") && !p.voidedAt && (
                        <FormDialog
                          title="Void payment"
                          triggerLabel="Void"
                          triggerVariant="ghost"
                          destructive
                          schema="voidPayment"
                          columns={1}
                          action={voidPaymentAction}
                          defaultValues={{ paymentId: p.id }}
                          fields={[
                            { name: "paymentId", label: "", type: "hidden" },
                            { name: "reason", label: "Reason", type: "textarea", required: true },
                          ]}
                        />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {payments.length === 0 && <EmptyState title="No payments recorded" />}
          </Card>
          {summary.overdueItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Arrears aging</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(summary.aging).map(([k, v]) => (
                  <StatCard key={k} label={`${k} days`} value={formatPeso(v)} tone={v > 0 ? "danger" : undefined} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {tab === "documents" && (
        <div className="space-y-4">
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Document</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                  <TH>File</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {docs.map((d) => {
                  const overdue = d.status !== "VERIFIED" && d.dueDate && d.dueDate < manilaToday();
                  return (
                    <TR key={d.id}>
                      <TD>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.required ? "Required" : "Optional"}
                          {d.rejectReason ? ` · Rejected: ${d.rejectReason}` : ""}
                          {d.verifiedAt ? ` · Verified ${formatDateTime(d.verifiedAt)}` : ""}
                        </div>
                      </TD>
                      <TD className={cn("text-xs", overdue && "font-medium text-red-700")}>{formatDay(d.dueDate)}</TD>
                      <TD>
                        <StatusBadge status={d.status} />
                      </TD>
                      <TD className="text-xs">
                        {d.document ? (
                          <a className="text-brand-700 hover:underline" href={`/api/files/${d.document.id}`}>
                            {d.document.fileName}
                          </a>
                        ) : (
                          can(user, "documents:update") && !closed && <UploadForm entityType="Transaction" entityId={t.id} checklistItemId={d.id} categories={[{ value: d.name, kyc: false }]} compact />
                        )}
                      </TD>
                      <TD className="text-right">
                        {can(user, "documents:update") && !closed && (
                          <FormDialog
                            title={d.name}
                            triggerLabel="Update"
                            triggerVariant="ghost"
                            schema="checklistUpdate"
                            columns={1}
                            action={updateChecklistItem}
                            defaultValues={{ id: d.id, status: d.status, dueDate: dayInput(d.dueDate), rejectReason: d.rejectReason }}
                            fields={[
                              { name: "id", label: "", type: "hidden" },
                              { name: "status", label: "Status", type: "select", emptyOption: false, options: options(can(user, "documents:verify") ? E.ChecklistStatus : (["PENDING", "SUBMITTED"] as const)) },
                              { name: "dueDate", label: "Due date", type: "date" },
                              { name: "rejectReason", label: "Rejection reason", type: "textarea" },
                            ]}
                          />
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {docs.length === 0 && <EmptyState title="No checklist items" />}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Other transaction files</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentsPanel entityType="Transaction" entityId={t.id} user={user} categories={["Contract", "Receipt", "Loan document", "Turnover", "Title", "Other"]} />
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "commission" && <CommissionLedgerPanel transactionId={t.id} user={user} />}
      {tab === "timeline" && (
        <Card>
          <CardContent className="pt-4">
            <Timeline filter={{ transactionId: id }} canAdd={can(user, "transactions:update")} />
          </CardContent>
        </Card>
      )}
      {tab === "tasks" && (
        <Card>
          <CardContent className="pt-4">
            <TasksPanel filter={{ transactionId: id }} />
          </CardContent>
        </Card>
      )}
      {tab === "history" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Status log</CardTitle>
            </CardHeader>
            <Table>
              <TBody>
                {t.statusLogs.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                    <TD className="text-xs">
                      {l.fromStatus ? label(l.fromStatus) : "—"} → <b>{label(l.toStatus)}</b>
                    </TD>
                    <TD className="text-xs text-muted-foreground">{l.note}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <AuditTable rows={(await prisma.auditLog.findMany({ where: { entity: "Transaction", entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })) as any} showEntity={false} />
          </Card>
        </div>
      )}
    </>
  );
}
