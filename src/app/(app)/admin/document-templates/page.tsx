import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { saveDocTemplateItem } from "@/server/actions/admin-config";
import { options, label } from "@/lib/labels";
import { E } from "@/lib/validation/schemas";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Documentation checklist" };

const fields: FieldDef[] = [
  { name: "id", label: "", type: "hidden" },
  { name: "name", label: "Document", required: true, span: 2 },
  { name: "description", label: "Description", type: "textarea", span: 2 },
  { name: "dueDaysAfterReservation", label: "Due (days after reservation)", type: "number" },
  { name: "order", label: "Order", type: "number" },
  { name: "financingFilter", label: "Only for financing (blank = all)", type: "multiselect", options: options(E.FinancingType), span: 2 },
  { name: "schemeFilter", label: "Only for scheme types (blank = all)", type: "multiselect", options: options(E.SchemeKind), span: 2 },
  { name: "required", label: "Required", type: "checkbox" },
  { name: "marriedOnly", label: "Only if buyer is married", type: "checkbox" },
  { name: "active", label: "Active", type: "checkbox" },
];

export default async function DocTemplatesPage() {
  const user = await requirePermission("settings:view");
  const rows = await prisma.documentTemplateItem.findMany({ orderBy: [{ order: "asc" }] });
  const editable = can(user, "settings:update");
  return (
    <>
      <PageHeader
        title="Documentation checklist template"
        description="Applied to every new reservation. Items can be limited to certain financing types, scheme types, or married buyers."
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        actions={editable && <FormDialog title="Add document" schema="docTemplateItem" wide fields={fields} action={saveDocTemplateItem} defaultValues={{ required: true, active: true, dueDaysAfterReservation: 30, order: rows.length + 1, financingFilter: [], schemeFilter: [] }} />}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Document</TH>
              <TH>Due</TH>
              <TH>Applies to</TH>
              <TH>Flags</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} className={r.active ? "" : "opacity-50"}>
                <TD>{r.order}</TD>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                </TD>
                <TD className="text-xs">{r.dueDaysAfterReservation} days</TD>
                <TD className="text-xs">
                  {[r.financingFilter.map(label).join(", "), r.schemeFilter.map(label).join(", "), r.marriedOnly ? "married buyers" : ""].filter(Boolean).join(" · ") || "All"}
                </TD>
                <TD>{r.required ? <StatusBadge status="PENDING" label="Required" /> : <StatusBadge status="DEACTIVATED" label="Optional" />}</TD>
                <TD className="text-right">{editable && <FormDialog title="Edit document" triggerLabel="Edit" triggerVariant="ghost" schema="docTemplateItem" wide fields={fields} action={saveDocTemplateItem} defaultValues={r} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
