import { prisma } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { fullName } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { DomainError } from "@/domain/errors";
import { renderTemplate } from "@/domain/automation/rules";
import { logActivity } from "./activities";
import { sendMailAs } from "./graph/mail";

const DAY = 86_400_000;

export async function enrollLead(sequenceId: string, leadId: string, ctx: ActorCtx) {
  const [seq, lead] = await Promise.all([
    prisma.emailSequence.findUnique({ where: { id: sequenceId }, include: { steps: { orderBy: { order: "asc" } } } }),
    prisma.lead.findUnique({ where: { id: leadId } }),
  ]);
  if (!seq || !seq.active || seq.deletedAt) throw new DomainError("Sequence is not active.");
  if (!lead || lead.deletedAt) throw new DomainError("Lead not found.");
  if (!lead.email) throw new DomainError("Lead has no email address.");
  if (lead.doNotEmail || lead.unsubscribedAt) throw new DomainError("Lead is marked do-not-email / unsubscribed.");
  const existing = await prisma.sequenceEnrollment.findFirst({ where: { sequenceId, leadId, status: "ACTIVE" } });
  if (existing) throw new DomainError("Lead is already enrolled in this sequence.");
  const first = seq.steps[0];
  if (!first) throw new DomainError("Sequence has no steps.");
  const e = await prisma.sequenceEnrollment.create({
    data: { sequenceId, leadId, nextStepOrder: first.order, nextRunAt: new Date(Date.now() + first.delayDays * DAY), stageIdAtEnrollment: lead.stageId, enrolledById: ctx.userId },
  });
  await logActivity({ type: "SYSTEM", subject: `Enrolled in email sequence “${seq.name}”`, leadId, actorId: ctx.userId });
  await audit(ctx, { entity: "SequenceEnrollment", entityId: e.id, action: "enroll", after: { sequenceId, leadId } });
  return e;
}

export async function stopEnrollments(opts: { leadId: string; reason: string; enrollmentId?: string; onlyStopOnReply?: boolean; onlyStopOnStageChange?: boolean; exceptStageId?: string; markReply?: boolean }) {
  const active = await prisma.sequenceEnrollment.findMany({
    where: {
      leadId: opts.leadId,
      status: "ACTIVE",
      ...(opts.enrollmentId ? { id: opts.enrollmentId } : {}),
      ...(opts.onlyStopOnReply ? { sequence: { stopOnReply: true } } : {}),
      ...(opts.onlyStopOnStageChange ? { sequence: { stopOnStageChange: true }, NOT: { stageIdAtEnrollment: opts.exceptStageId } } : {}),
    },
    include: { sequence: true },
  });
  for (const e of active) {
    await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { status: "STOPPED", stoppedReason: opts.reason, nextRunAt: null } });
    if (opts.markReply) {
      const last = await prisma.sequenceSend.findFirst({ where: { enrollmentId: e.id, status: "SENT" }, orderBy: { sentAt: "desc" } });
      if (last) await prisma.sequenceSend.update({ where: { id: last.id }, data: { repliedAt: new Date() } });
    }
    await logActivity({ type: "SYSTEM", subject: `Email sequence “${e.sequence.name}” stopped: ${opts.reason}`, leadId: opts.leadId });
  }
  return active.length;
}

export function unsubscribeUrl(token: string) {
  return `${process.env.APP_URL ?? ""}/unsubscribe/${token}`;
}

/** Worker: send due sequence steps from the lead owner's Outlook mailbox. */
export async function runDueSequences(now = new Date()) {
  const due = await prisma.sequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now } },
    include: { sequence: { include: { steps: { orderBy: { order: "asc" }, include: { template: true } } } }, lead: { include: { owner: true, developments: true, broker: true } } },
    take: 100,
  });
  let sent = 0;
  for (const e of due) {
    const lead = e.lead;
    if (!e.sequence.active || e.sequence.deletedAt) {
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { status: "STOPPED", stoppedReason: "Sequence deactivated", nextRunAt: null } });
      continue;
    }
    if (!lead.email || lead.doNotEmail || lead.unsubscribedAt || lead.deletedAt) {
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { status: "STOPPED", stoppedReason: "Do not email / unsubscribed", nextRunAt: null } });
      continue;
    }
    const step = e.sequence.steps.find((s) => s.order === e.nextStepOrder);
    if (!step) {
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { status: "COMPLETED", nextRunAt: null } });
      continue;
    }
    const sender = lead.owner ?? (e.enrolledById ? await prisma.user.findUnique({ where: { id: e.enrolledById } }) : null);
    if (!sender) {
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { nextRunAt: new Date(now.getTime() + 6 * 3_600_000) } });
      continue;
    }
    const unsub = unsubscribeUrl(lead.unsubscribeToken);
    const ctx = {
      lead: { firstName: lead.firstName, lastName: lead.lastName, fullName: fullName(lead), email: lead.email },
      owner: { name: sender.name, email: sender.email, phone: sender.phone ?? "" },
      development: { name: lead.developments[0]?.name ?? "Citrineland" },
      broker: { name: lead.broker ? fullName(lead.broker) : "" },
      unsubscribeUrl: unsub,
    };
    const subject = renderTemplate(step.template.subject, ctx, { escapeHtml: false });
    const html = `${renderTemplate(step.template.bodyHtml, ctx)}<p style="color:#888;font-size:11px;margin-top:24px">If you no longer wish to receive these emails, <a href="${unsub}">unsubscribe here</a>.</p>`;
    const r = await sendMailAs(sender.id, { to: [lead.email], subject, html });
    if (r.ok) {
      await prisma.sequenceSend.create({ data: { enrollmentId: e.id, stepId: step.id, status: "SENT" } });
      await logActivity({ type: "EMAIL_OUT", subject, body: `Sequence “${e.sequence.name}” step ${step.order}`, leadId: lead.id, actorId: sender.id, externalKey: r.internetMessageId ? `mail:${r.internetMessageId}:lead:${lead.id}` : null, meta: { sequenceId: e.sequenceId, stepOrder: step.order } });
      const next = e.sequence.steps.find((s) => s.order > step.order);
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: next ? { nextStepOrder: next.order, nextRunAt: new Date(now.getTime() + next.delayDays * DAY) } : { status: "COMPLETED", nextRunAt: null } });
      sent++;
    } else {
      await prisma.sequenceSend.create({ data: { enrollmentId: e.id, stepId: step.id, status: "FAILED", error: r.error.slice(0, 500) } });
      const failures = await prisma.sequenceSend.count({ where: { enrollmentId: e.id, stepId: step.id, status: "FAILED" } });
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: failures >= 3 ? { status: "STOPPED", stoppedReason: `Send failed 3 times: ${r.error.slice(0, 100)}`, nextRunAt: null } : { nextRunAt: new Date(now.getTime() + 3_600_000) } });
      logger.warn({ enrollment: e.id, err: r.error }, "sequence send failed");
    }
  }
  return sent;
}

export async function unsubscribeByToken(token: string) {
  const lead = await prisma.lead.findUnique({ where: { unsubscribeToken: token } });
  if (!lead) return null;
  if (!lead.unsubscribedAt) {
    await prisma.lead.update({ where: { id: lead.id }, data: { unsubscribedAt: new Date(), doNotEmail: true } });
    await stopEnrollments({ leadId: lead.id, reason: "Unsubscribed" });
    await logActivity({ type: "SYSTEM", subject: "Unsubscribed from emails (via link)", leadId: lead.id });
    await prisma.auditLog.create({ data: { entity: "Lead", entityId: lead.id, action: "unsubscribe" } });
  }
  return lead;
}
