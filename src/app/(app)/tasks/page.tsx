import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { TasksPanel } from "@/components/app/tasks-panel";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const viewAll = can(user, "tasks:view_all");
  const assignee = viewAll && sp.assigneeId ? sp.assigneeId : user.id;
  const users = viewAll ? await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  return (
    <>
      <PageHeader
        title={assignee === user.id ? "My Tasks" : "Tasks"}
        description="Open tasks, oldest due first. Overdue tasks are highlighted."
        actions={
          viewAll && (
            <form method="get" className="flex items-center gap-2">
              <NativeSelect name="assigneeId" defaultValue={assignee} className="w-56">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === user.id ? `Me (${u.name})` : u.name}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="secondary" size="sm">
                View
              </Button>
            </form>
          )
        }
      />
      <Card>
        <CardContent className="pt-4">
          <TasksPanel filter={{ assigneeId: assignee }} showRelated />
        </CardContent>
      </Card>
    </>
  );
}
