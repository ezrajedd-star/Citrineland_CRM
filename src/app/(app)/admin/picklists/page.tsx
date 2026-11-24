import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, LinkTabs, StatusBadge } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { savePicklist } from "@/server/actions/admin-config";
import { PICKLIST_TYPES } from "@/lib/picklists";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Picklists" };

export default async function PicklistsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("settings:view");
  const type = (await searchParams).tab ?? "LEAD_SOURCE";
  const rows = await prisma.picklist.findMany({ where: { type }, orderBy: [{ order: "asc" }, { label: "asc" }] });
  const editable = can(user, "settings:update");
  const fields = (isNew: boolean): FieldDef[] => [
    { name: "id", label: "", type: "hidden" },
    { name: "type", label: "", type: "hidden" },
    { name: "code", label: "Code", required: true, help: isNew ? "UPPER_SNAKE_CASE; can't be changed later" : "Code can't be changed" },
    { name: "label", label: "Label", required: true },
    { name: "order", label: "Order", type: "number" },
    { name: "active", label: "Active", type: "checkbox" },
  ];
  return (
    <>
      <PageHeader title="Picklists" breadcrumbs={[{ href: "/admin", label: "Admin" }]} actions={editable && <FormDialog title="Add value" schema="picklist" fields={fields(true)} action={savePicklist} defaultValues={{ type, order: rows.length + 1, active: true }} />} />
      <LinkTabs baseHref="/admin/picklists" active={type} tabs={Object.entries(PICKLIST_TYPES).map(([k, v]) => ({ key: k, label: v }))} />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Label</TH>
              <TH>Code</TH>
              <TH>Order</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.label}</TD>
                <TD className="text-xs text-muted-foreground">{r.code}</TD>
                <TD>{r.order}</TD>
                <TD>
                  <StatusBadge status={r.active ? "ACTIVE" : "DEACTIVATED"} label={r.active ? "Active" : "Inactive"} />
                </TD>
                <TD className="text-right">{editable && <FormDialog title="Edit value" triggerLabel="Edit" triggerVariant="ghost" schema="picklist" fields={fields(false)} action={savePicklist} defaultValues={r} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
