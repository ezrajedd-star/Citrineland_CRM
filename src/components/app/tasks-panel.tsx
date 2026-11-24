import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { StatusBadge, EmptyState } from "./page";
import { FormDialog } from "./form-dialog";
import { ActionButton } from "./confirm-action";
import { saveTask, setTaskStatus } from "@/server/actions/crm";
import { taskFields } from "@/components/forms/crm-fields";
import { userOptions } from "@/server/queries/options";

export async function TasksPanel({ filter, showRelated = false }: { filter: { leadId?: string; clientId?: string; brokerId?: string; transactionId?: string; assigneeId?: string }; showRelated?: boolean }) {
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { ...filter, status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { assignee: { select: { name: true } }, lead: { select: { id: true, firstName: true, lastName: true } }, client: { select: { id: true, firstName: true, lastName: true } }, transaction: { select: { id: true, code: true } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 100,
    }),
    userOptions(),
  ]);
  const now = Date.now();
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FormDialog title="New task" triggerLabel="Add task" schema="task" fields={taskFields(users)} action={saveTask} defaultValues={{ priority: "MEDIUM", ...filter }} wide />
      </div>
      {tasks.length === 0 ? (
        <EmptyState title="No open tasks" />
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {tasks.map((t) => {
            const overdue = t.dueAt && t.dueAt.getTime() < now;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <ActionButton action={setTaskStatus} args={{ id: t.id, status: "DONE" }} successMessage="Task completed" variant="outline" size="sm">
                  Done
                </ActionButton>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className={cn(overdue && "font-medium text-red-700")}>{t.dueAt ? `Due ${formatDateTime(t.dueAt)}` : "No due date"}</span> · {t.assignee?.name ?? "Unassigned"}
                    {showRelated && t.lead && (
                      <>
                        {" "}
                        · <a className="hover:underline" href={`/pipeline/leads/${t.lead.id}`}>{t.lead.firstName} {t.lead.lastName}</a>
                      </>
                    )}
                    {showRelated && t.client && (
                      <>
                        {" "}
                        · <a className="hover:underline" href={`/clients/${t.client.id}`}>{t.client.firstName} {t.client.lastName}</a>
                      </>
                    )}
                    {showRelated && t.transaction && (
                      <>
                        {" "}
                        · <a className="hover:underline" href={`/transactions/${t.transaction.id}`}>{t.transaction.code}</a>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={t.priority} label={label(t.priority)} />
                <FormDialog
                  title="Edit task"
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                  schema="task"
                  fields={taskFields(users)}
                  action={saveTask}
                  wide
                  defaultValues={{ ...t, dueAt: t.dueAt ? new Date(t.dueAt.getTime() + 8 * 3600_000).toISOString().slice(0, 16) : "" }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
