import type { Permission } from "./permissions";

export interface PermissionSubject {
  id: string;
  permissions: ReadonlySet<string> | readonly string[];
  roleKey?: string | null;
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(public permission: string) {
    super(`You don't have permission to do this (${permission}).`);
    this.name = "ForbiddenError";
  }
}

function has(perms: ReadonlySet<string> | readonly string[], p: string) {
  return "has" in perms ? perms.has("*") || perms.has(p) : perms.includes("*") || perms.includes(p);
}

/** True if the user holds the permission. "*" grants everything. */
export function can(user: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return has(user.permissions, permission);
}

export function canAny(user: PermissionSubject | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

/** Throws ForbiddenError unless the user holds the permission. Use in every server action/route/query. */
export function assertCan(user: PermissionSubject | null | undefined, permission: Permission): asserts user is PermissionSubject {
  if (!can(user, permission)) throw new ForbiddenError(permission);
}
