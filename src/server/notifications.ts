import { prisma, type Tx } from "@/lib/db";
import type { Permission } from "@/lib/rbac/permissions";

export interface NotifyInput {
  title: string;
  body?: string | null;
  link?: string | null;
  kind?: string;
  /** Unique per recipient: `${dedupeKey}:${userId}` prevents duplicates from repeated job runs */
  dedupeKey?: string;
}

/** Create in-app notifications (email delivery for opted-in users is done by the worker). */
export async function notifyUsers(userIds: (string | null | undefined)[], n: NotifyInput, tx: Tx = prisma) {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[]));
  if (!ids.length) return 0;
  const res = await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      kind: n.kind ?? "INFO",
      dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : null,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Active users whose role grants a permission (or role key). */
export async function usersWithPermission(permission: Permission, tx: Tx = prisma): Promise<string[]> {
  const roles = await tx.role.findMany({ where: { OR: [{ permissions: { has: permission } }, { permissions: { has: "*" } }] }, select: { id: true } });
  const users = await tx.user.findMany({ where: { roleId: { in: roles.map((r) => r.id) }, status: "ACTIVE", deletedAt: null, type: "STAFF" }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function usersWithRoleKey(keys: string[], tx: Tx = prisma): Promise<string[]> {
  const users = await tx.user.findMany({ where: { role: { key: { in: keys } }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  return users.map((u) => u.id);
}
