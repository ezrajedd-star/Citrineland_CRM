import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { saveQuota, deleteQuota } from "@/server/actions/commissions";
import { userOptions, brokerOptions, brokerageOptions } from "@/server/queries/options";
import { formatPeso, n } from "@/lib/money";
import { dayInput, manilaToday } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { E } from "@/lib/validation/schemas";
import { fullName } from "@/lib/utils";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Quotas" };

export default async function QuotasPage() {
  await requirePermission("quotas:manage");
  const [quotas, users, brokers, brokerages] = await Promise.all([
    prisma.quota.findMany({ include: { user: { select: { name: true } }, broker: true, brokerage: { select: { name: true } } }, orderBy: [{ periodStart: "desc" }] }),
    userOptions(),
    brokerOptions(),
    brokerageOptions(),
  ]);
  const fields: FieldDef[] = [
    { name: "id", label: "", type: "hidden" },
    { name: "targetType", label: "Quota for", type: "select", options: options(E.QuotaTarget), emptyOption: false },
    { name: "periodType", label: "Period", type: "select", options: options(E.QuotaPeriod), emptyOption: false },
    { name: "userId", label: "Staff (if staff)", type: "select", options: users },
    { name: "periodStart", label: "Period starting", type: "date", required: true, help: "Snapped to the 1st of the month/quarter" },
    { name: "brokerId", label: "Broker (if broker)", type: "select", options: brokers },
    { name: "brokerageId", label: "Brokerage (if brokerage)", type: "select", options: brokerages },
    { name: "units", label: "Units target", type: "number" },
    { name: "value", label: "Value target (TCP)", type: "money" },
  ];
  return (
    <>
      <PageHeader title="Quotas" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="Targets per staff member, broker or brokerage per month/quarter. Compared against actuals in Reports → Quota vs actual and the dashboard." actions={<FormDialog title="New quota" schema="quota" fields={fields} action={saveQuota} defaultValues={{ targetType: "STAFF", periodType: "MONTH", periodStart: dayInput(manilaToday()) }} />} />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH>Target</TH>
              <TH className="text-right">Units</TH>
              <TH className="text-right">Value</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {quotas.map((q) => (
              <TR key={q.id}>
                <TD className="text-xs">
                  {label(q.periodType)} from {dayInput(q.periodStart)}
                </TD>
                <TD>
                  {q.user?.name ?? (q.broker ? fullName(q.broker) : q.brokerage?.name)} <span className="text-xs text-muted-foreground">({label(q.targetType)})</span>
                </TD>
                <TD className="text-right tabular">{q.units ?? "—"}</TD>
                <TD className="text-right tabular">{q.valueCents != null ? formatPeso(q.valueCents) : "—"}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <FormDialog title="Edit quota" triggerLabel="Edit" triggerVariant="ghost" schema="quota" fields={fields} action={saveQuota} defaultValues={{ ...q, periodStart: dayInput(q.periodStart), value: q.valueCents != null ? n(q.valueCents) / 100 : "" }} />
                    <ConfirmAction action={deleteQuota} args={{ id: q.id }} title="Delete this quota?" variant="ghost" destructive>
                      Delete
                    </ConfirmAction>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {quotas.length === 0 && <EmptyState title="No quotas yet" />}
      </Card>
    </>
  );
}
