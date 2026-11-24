import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, StatusBadge } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction, ActionButton } from "@/components/app/confirm-action";
import { saveStage, deleteStage, reorderStages } from "@/server/actions/admin-config";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Pipeline stages" };

const fields: FieldDef[] = [
  { name: "id", label: "", type: "hidden" },
  { name: "name", label: "Name", required: true },
  { name: "color", label: "Color", type: "color" },
  { name: "probability", label: "Win probability %", type: "number" },
  { name: "stalledAfterDays", label: "Stalled after (days)", type: "number" },
  { name: "isWon", label: "Won stage (reservation)", type: "checkbox" },
  { name: "isLost", label: "Lost stage", type: "checkbox" },
  { name: "active", label: "Active", type: "checkbox" },
];

export default async function StagesPage() {
  await requirePermission("pipeline:manage");
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { leads: { where: { deletedAt: null } } } } } });
  const ids = stages.map((s) => s.id);
  const swap = (i: number, j: number) => {
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  return (
    <>
      <PageHeader
        title="Pipeline stages"
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        description="Exactly one active stage should be the won stage (reached by creating a reservation)."
        actions={<FormDialog title="Add stage" schema="stage" fields={fields} action={saveStage} defaultValues={{ color: "#a8a29e", probability: 10, stalledAfterDays: 14, active: true }} />}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Order</TH>
              <TH>Stage</TH>
              <TH>Probability</TH>
              <TH>Stalled after</TH>
              <TH>Flags</TH>
              <TH className="text-right">Leads</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {stages.map((s, i) => (
              <TR key={s.id} className={s.active ? "" : "opacity-50"}>
                <TD>
                  <div className="flex gap-1">
                    {i > 0 && (
                      <ActionButton action={reorderStages} args={{ ids: swap(i, i - 1) }} variant="ghost" size="sm" successMessage="">
                        ↑
                      </ActionButton>
                    )}
                    {i < stages.length - 1 && (
                      <ActionButton action={reorderStages} args={{ ids: swap(i, i + 1) }} variant="ghost" size="sm" successMessage="">
                        ↓
                      </ActionButton>
                    )}
                  </div>
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                </TD>
                <TD>{s.probability}%</TD>
                <TD>{s.stalledAfterDays} days</TD>
                <TD className="space-x-1">
                  {s.isWon && <StatusBadge status="ACTIVE" label="Won" />}
                  {s.isLost && <StatusBadge status="CANCELLED" label="Lost" />}
                  {!s.active && <StatusBadge status="DEACTIVATED" label="Inactive" />}
                </TD>
                <TD className="text-right tabular">{s._count.leads}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <FormDialog title="Edit stage" triggerLabel="Edit" triggerVariant="ghost" schema="stage" fields={fields} action={saveStage} defaultValues={s} />
                    <ConfirmAction action={deleteStage} args={{ id: s.id }} title={`Delete stage ${s.name}?`} description="Stages with history are deactivated instead." destructive variant="ghost">
                      Delete
                    </ConfirmAction>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
