"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { userSchema, roleSchema } from "@/lib/validation/schemas";
import { DomainError } from "@/domain/errors";
import { isPermission } from "@/lib/rbac/permissions";

const pickUser = (u: any) => ({ id: u.id, email: u.email, name: u.name, roleId: u.roleId, status: u.status, phone: u.phone, emailNotifications: u.emailNotifications, deletedAt: u.deletedAt });

export const saveUser = action(null, userSchema, async (input, ctx) => {
  const perm = input.id ? "users:update" : "users:create";
  if (!ctx.user.permissions.has("*") && !ctx.user.permissions.has(perm)) throw new DomainError("You don't have permission to manage users.");
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new DomainError("Role not found");
  if (input.id) {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: input.id } });
    if (before.id === ctx.userId && (input.status !== "ACTIVE" || input.roleId !== before.roleId)) {
      throw new DomainError("You can't change your own role or deactivate yourself.");
    }
    const after = await prisma.user.update({
      where: { id: input.id },
      data: { name: input.name, email: input.email, roleId: input.roleId, status: input.status, phone: input.phone, emailNotifications: input.emailNotifications },
    });
    if (input.status === "DEACTIVATED") await revokeSessions(after.id, "deactivated");
    await audit(ctx, { entity: "User", entityId: after.id, action: "update", before: pickUser(before), after: pickUser(after) });
  } else {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && !existing.deletedAt) throw new DomainError("A user with this email already exists.");
    const data = { name: input.name, email: input.email, roleId: input.roleId, status: input.status === "DEACTIVATED" ? "DEACTIVATED" : ("INVITED" as const), phone: input.phone, emailNotifications: input.emailNotifications, invitedAt: new Date(), createdById: ctx.userId, deletedAt: null };
    const u = existing ? await prisma.user.update({ where: { id: existing.id }, data: data as any }) : await prisma.user.create({ data: data as any });
    await audit(ctx, { entity: "User", entityId: u.id, action: "invite", after: pickUser(u) });
  }
  revalidatePath("/admin/users");
  return { ok: true as const, message: input.id ? "User updated" : "User invited. They can now sign in with Microsoft." };
});

async function revokeSessions(userId: string, reason: string) {
  const r = await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  return r.count;
}

export const setUserStatus = action("users:update", z.object({ id: z.string(), status: z.enum(["ACTIVE", "DEACTIVATED"]) }), async ({ id, status }, ctx) => {
  if (id === ctx.userId) throw new DomainError("You can't change your own status.");
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  const after = await prisma.user.update({ where: { id }, data: { status } });
  if (status === "DEACTIVATED") await revokeSessions(id, "deactivated");
  await audit(ctx, { entity: "User", entityId: id, action: status === "ACTIVE" ? "activate" : "deactivate", before: pickUser(before), after: pickUser(after) });
  revalidatePath("/admin/users");
  return { ok: true as const, message: status === "ACTIVE" ? "User activated" : "User deactivated and signed out" };
});

export const deleteUser = action("users:delete", z.object({ id: z.string() }), async ({ id }, ctx) => {
  if (id === ctx.userId) throw new DomainError("You can't delete yourself.");
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  // Soft delete keeps referential integrity for history; email is freed for re-invite.
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "DEACTIVATED", email: `deleted+${id}@${before.email.split("@")[1] ?? "deleted"}` } });
  await revokeSessions(id, "deleted");
  await prisma.microsoftConnection.deleteMany({ where: { userId: id } });
  await audit(ctx, { entity: "User", entityId: id, action: "delete", before: pickUser(before) });
  revalidatePath("/admin/users");
  return { ok: true as const, message: "User deleted" };
});

export const forceSignOut = action("users:update", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const count = await revokeSessions(id, "forced_by_admin");
  await prisma.authEvent.create({ data: { type: "FORCED_SIGN_OUT", userId: id, reason: `by ${ctx.user.email}`, ip: ctx.ip } });
  await audit(ctx, { entity: "User", entityId: id, action: "force_sign_out", after: { sessionsRevoked: count } });
  return { ok: true as const, message: `Signed out of ${count} session(s)` };
});

// ── Roles ──
export const saveRole = action("roles:manage", roleSchema, async (input, ctx) => {
  if (input.id) {
    const before = await prisma.role.findUniqueOrThrow({ where: { id: input.id } });
    const after = await prisma.role.update({ where: { id: input.id }, data: { name: input.name, description: input.description } });
    await audit(ctx, { entity: "Role", entityId: after.id, action: "update", before, after });
  } else {
    const r = await prisma.role.create({ data: { name: input.name, description: input.description, permissions: [], createdById: ctx.userId } });
    await audit(ctx, { entity: "Role", entityId: r.id, action: "create", after: r });
    return { ok: true as const, message: "Role created", redirect: `/admin/roles/${r.id}` };
  }
  revalidatePath("/admin/roles");
  return { ok: true as const, message: "Role saved" };
});

export const deleteRole = action("roles:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const role = await prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  if (role.isSystem) throw new DomainError("System roles cannot be deleted.");
  if (role._count.users > 0) throw new DomainError(`Reassign the ${role._count.users} user(s) with this role first.`);
  await prisma.role.delete({ where: { id } });
  await audit(ctx, { entity: "Role", entityId: id, action: "delete", before: role });
  revalidatePath("/admin/roles");
  return { ok: true as const, message: "Role deleted", redirect: "/admin/roles" };
});

export const saveRolePermissions = action("roles:manage", z.object({ id: z.string(), permissions: z.array(z.string()) }), async ({ id, permissions }, ctx) => {
  const role = await prisma.role.findUniqueOrThrow({ where: { id } });
  if (role.key === "ADMIN") throw new DomainError("The Admin role always has every permission.");
  const clean = Array.from(new Set(permissions.filter(isPermission))).sort();
  const after = await prisma.role.update({ where: { id }, data: { permissions: clean } });
  await audit(ctx, { entity: "Role", entityId: id, action: "update_permissions", before: { permissions: role.permissions }, after: { permissions: after.permissions } });
  revalidatePath(`/admin/roles/${id}`);
  return { ok: true as const, message: "Permissions saved" };
});
