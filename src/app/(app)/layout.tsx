import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { NAV } from "@/config/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { markNotificationsRead, signOutAction } from "@/server/actions/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const now = new Date();
  const [openTasks, overdueTasks, notifications, unread] = await Promise.all([
    prisma.task.count({ where: { assigneeId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.task.count({ where: { assigneeId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const sections = NAV.map((s) => ({
    section: s.section,
    items: s.items.filter((i) => !i.anyOf || i.anyOf.some((p) => user.permissions.has(p))).map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar sections={sections} overdueTasks={overdueTasks} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: user.name, email: user.email, roleName: user.roleName }}
          openTasks={openTasks}
          overdueTasks={overdueTasks}
          unread={unread}
          notifications={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))}
          markRead={markNotificationsRead}
          signOutAction={signOutAction}
          sections={sections}
        />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
