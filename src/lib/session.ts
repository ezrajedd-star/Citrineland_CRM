import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import { ALL_PERMISSIONS, type Permission } from "./rbac/permissions";
import { assertCan, can } from "./rbac/can";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleKey: string | null;
  roleName: string;
  permissions: ReadonlySet<string>;
  sessionId: string;
}

/** Validates the JWT's session id against the DB (revocation, expiry, active user). Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth();
  const sid = s?.sid;
  if (!sid) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: sid },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.revokedAt || session.expires < new Date()) return null;
  const u = session.user;
  if (u.deletedAt || u.status !== "ACTIVE") return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const perms = u.role.permissions.includes("*") ? new Set<string>(["*", ...ALL_PERMISSIONS]) : new Set<string>(u.role.permissions);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: perms,
    sessionId: session.id,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login?error=SessionExpired");
  return u;
}

/** For pages: redirect to /forbidden if missing permission */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u, permission)) redirect(`/forbidden?p=${encodeURIComponent(permission)}`);
  return u;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!permissions.some((p) => can(u, p))) redirect(`/forbidden?p=${encodeURIComponent(permissions.join(","))}`);
  return u;
}

export { assertCan, can };
