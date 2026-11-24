import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/app/confirm-action";
import { markNotificationsRead } from "@/server/actions/shell";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Notifications" actions={<ActionButton action={markNotificationsRead} args={{ all: true }} successMessage="All marked as read">Mark all read</ActionButton>} />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No notifications" />
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className={cn("px-4 py-3 text-sm", !n.readAt && "bg-brand-50/50")}>
                <div className="flex items-baseline justify-between gap-2">
                  {n.link ? (
                    <Link href={n.link} className="font-medium text-stone-900 hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{n.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </div>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
