"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac/can";
import { composeEmailSchema } from "@/lib/validation/schemas";
import { DomainError } from "@/domain/errors";
import { sendMailAs } from "@/server/graph/mail";
import { logActivity } from "@/server/activities";

export const sendEmail = action(null, composeEmailSchema, async (input, ctx) => {
  const perm = input.leadId ? "leads:update" : input.clientId ? "clients:update" : input.brokerId ? "brokers:update" : input.transactionId ? "transactions:update" : null;
  if (!perm || (!can(ctx.user, perm as any) && !can(ctx.user, "computations:send"))) throw new DomainError("You can't email from this record.");
  // Respect do-not-email / unsubscribe flags
  const recipients = input.to.map((t) => t.toLowerCase());
  const blocked = await prisma.lead.findFirst({ where: { email: { in: recipients, mode: "insensitive" }, OR: [{ doNotEmail: true }, { unsubscribedAt: { not: null } }] } });
  const blockedClient = await prisma.client.findFirst({ where: { email: { in: recipients, mode: "insensitive" }, doNotEmail: true } });
  if (blocked || blockedClient) throw new DomainError("A recipient is marked “do not email”.");

  const attachments: { name: string; contentType: string; contentBytes: Buffer }[] = [];
  if (input.computationId) {
    if (!can(ctx.user, "computations:send")) throw new DomainError("You can't send sample computations.");
    const { renderComputationPdf } = await import("@/server/pdf/computation-pdf");
    const { buffer, fileName } = await renderComputationPdf(input.computationId);
    attachments.push({ name: fileName, contentType: "application/pdf", contentBytes: buffer });
  }
  const r = await sendMailAs(ctx.userId, { to: input.to, cc: input.cc, subject: input.subject, html: input.bodyHtml, attachments });
  if (!r.ok) throw new DomainError(r.error);
  const entity = input.leadId ? `lead:${input.leadId}` : input.clientId ? `client:${input.clientId}` : input.brokerId ? `broker:${input.brokerId}` : null;
  await logActivity({
    type: "EMAIL_OUT",
    externalKey: r.internetMessageId && entity ? `mail:${r.internetMessageId}:${entity}` : null,
    subject: input.subject,
    body: input.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    actorId: ctx.userId,
    leadId: input.leadId,
    clientId: input.clientId,
    brokerId: input.brokerId,
    transactionId: input.transactionId,
    meta: { webLink: r.webLink, participants: `To: ${input.to.join(", ")}${input.cc.length ? ` · Cc: ${input.cc.join(", ")}` : ""}`, attachments: attachments.map((a) => a.name), sentViaCrm: true },
  });
  if (input.computationId) await prisma.sampleComputation.update({ where: { id: input.computationId }, data: { sentAt: new Date() } });
  await audit(ctx, { entity: "Email", entityId: input.leadId ?? input.clientId ?? input.brokerId ?? input.transactionId ?? "-", action: "send", after: { to: input.to, subject: input.subject, computationId: input.computationId } });
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Email sent from your Outlook" };
});
