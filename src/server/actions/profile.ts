"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { syncMailbox, syncCalendar } from "@/server/graph/sync";
import { DomainError } from "@/domain/errors";
import { getBoss } from "@/worker/boss";

export const setEmailNotifications = action(null, z.object({ enabled: z.boolean() }), async ({ enabled }, ctx) => {
  await prisma.user.update({ where: { id: ctx.userId }, data: { emailNotifications: enabled } });
  revalidatePath("/profile");
  return { ok: true as const, message: enabled ? "Email notifications on" : "Email notifications off" };
});

export const syncMyMailbox = action(null, z.object({}), async (_i, ctx) => {
  const conn = await prisma.microsoftConnection.findUnique({ where: { userId: ctx.userId } });
  if (!conn) throw new DomainError("Microsoft 365 is not connected.");
  const mail = await syncMailbox(ctx.userId);
  const cal = await syncCalendar(ctx.userId);
  revalidatePath("/profile");
  return { ok: true as const, message: `Synced: ${mail.logged} email(s), ${cal.logged} meeting(s) logged` };
});

export const disconnectMicrosoft = action(null, z.object({ userId: z.string().optional() }), async ({ userId }, ctx) => {
  const target = userId ?? ctx.userId;
  if (target !== ctx.userId && !ctx.user.permissions.has("integrations:manage") && !ctx.user.permissions.has("*")) throw new DomainError("Forbidden");
  await prisma.microsoftConnection.updateMany({ where: { userId: target }, data: { status: "DISCONNECTED", refreshTokenEnc: "", accessTokenEnc: null, accessTokenExpiresAt: null } });
  await audit(ctx, { entity: "MicrosoftConnection", entityId: target, action: "disconnect" });
  revalidatePath("/profile");
  revalidatePath("/admin/integrations");
  return { ok: true as const, message: "Microsoft 365 disconnected" };
});

export async function connectMicrosoft() {
  await signIn("microsoft-entra-id", { redirectTo: "/profile" });
}

export const retryJob = action("jobs:manage", z.object({ name: z.string(), id: z.string() }), async ({ name, id }, ctx) => {
  const boss = await getBoss();
  await boss.retry(name, id);
  await audit(ctx, { entity: "Job", entityId: id, action: "retry", after: { name } });
  revalidatePath("/admin/jobs");
  return { ok: true as const, message: "Job queued for retry" };
});
