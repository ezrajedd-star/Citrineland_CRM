"use server";

import { z } from "zod";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { getCurrentUser } from "@/lib/session";

export const markNotificationsRead = action(null, z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }), async (input, ctx) => {
  await prisma.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { ok: true as const, message: "" };
});

export async function signOutAction() {
  const u = await getCurrentUser();
  if (u) {
    await prisma.session.updateMany({ where: { id: u.sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "sign_out" } });
    await prisma.authEvent.create({ data: { type: "SIGN_OUT", userId: u.id, email: u.email } });
  }
  await signOut({ redirectTo: "/login" });
}
