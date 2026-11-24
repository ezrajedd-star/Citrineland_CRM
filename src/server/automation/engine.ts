import type { AutomationRule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SYSTEM_CTX } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { fullName } from "@/lib/utils";
import { formatDay } from "@/lib/format";
import { formatPeso } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { matchesAll, nextRoundRobin, type Condition } from "@/domain/automation/rules";
import type { DomainEvent } from "../events";
import { notifyUsers, usersWithPermission, usersWithRoleKey } from "../notifications";
import { logActivity } from "../activities";
import { afterReservation } from "../transactions";
import { enrollLead, stopEnrollments } from "../sequences";


/** Built-in automations: each is toggleable in Admin → Automations, with configurable timings. */
export const BUILTINS = {
  lead_assignment: {
    name: "New lead → assign owner, first-contact task, notify",
    trigger: "lead.created",
    description: "Assigns an owner (round-robin among selected users, or by development) when the lead has none, creates a “First contact” task and notifies the owner.",
    config: { strategy: "round_robin", userIds: [] as string[], developmentOwners: {} as Record<string, string>, taskDueHours: 24, lastAssignedId: null as string | null },
  },
  lead_inactivity: {
    name: "Lead without activity → follow-up",
    trigger: "schedule.daily",
    description: "When an open lead has no activity for X days, creates a follow-up task and notifies the owner and Sales Managers.",
    config: { days: 7 },
  },
  lead_stage_sequences: {
    name: "Lead stage change → enroll/unenroll sequences",
    trigger: "lead.stage_changed",
    description: "Enrolls the lead in sequences whose trigger stage matches, and stops sequences set to stop on stage change.",
    config: {},
  },
  hold_expiry: {
    name: "Unit hold nearing expiry / expired → notify",
    trigger: "schedule.15min",
    description: "Warns the holder before a hold expires. Expired holds are always auto-released (business rule).",
    config: { hoursBefore: 6 },
  },
  reservation_created: {
    name: "Reservation created → documentation tasks, notify BNG",
    trigger: "transaction.reserved",
    description: "Payment schedule and checklist are always generated at reservation; this creates a task per required document and notifies BNG staff.",
    config: {},
  },
  document_overdue: {
    name: "Documentation item overdue → task + notification",
    trigger: "schedule.hourly",
    description: "Creates a task and notifies the handling staff when a required checklist item passes its due date.",
    config: {},
  },
  payment_reminders: {
    name: "Payment due soon / overdue → internal task",
    trigger: "schedule.daily",
    description: "Creates tasks for handling staff for installments due within X days and for overdue installments (internal only — no client dunning).",
    config: { daysBefore: 7 },
  },
  commission_due: {
    name: "Collection milestone reached → notify Sales Manager",
    trigger: "payment.recorded",
    description: "Tranches always become DUE automatically; this controls the notification to approvers.",
    config: {},
  },
  broker_expiry: {
    name: "Broker PRC license / accreditation expiring → notify BNG",
    trigger: "schedule.daily",
    description: "Notifies BNG at 60/30/7 days before PRC license or accreditation expiry, and sets accreditation to EXPIRED on expiry.",
    config: { days: [60, 30, 7] },
  },
} as const;
export type BuiltinKey = keyof typeof BUILTINS;

const cache = new Map<string, { at: number; rule: AutomationRule | null }>();

export async function builtinRule(key: BuiltinKey): Promise<{ enabled: boolean; config: any; rule: AutomationRule | null }> {
  const c = cache.get(key);
  const rule = c && Date.now() - c.at < 30_000 ? c.rule : await prisma.automationRule.findUnique({ where: { builtInKey: key } });
  cache.set(key, { at: Date.now(), rule });
  return { enabled: rule ? rule.enabled : true, config: { ...BUILTINS[key].config, ...((rule?.config as object) ?? {}) }, rule };
}

export async function automationEnabled(key: BuiltinKey) {
  return (await builtinRule(key)).enabled;
}

async function log(ruleId: string | undefined, status: string, message: string, entity?: string, entityId?: string) {
  if (!ruleId) return;
  await prisma.automationLog.create({ data: { ruleId, status, message: message.slice(0, 500), entity, entityId } }).catch(() => {});
}

// ── Event dispatch ──
export async function dispatch(event: DomainEvent) {
  switch (event.type) {
    case "lead.created": {
      await onLeadCreated(event.leadId);
      const l = await prisma.lead.findUnique({ where: { id: event.leadId }, select: { stageId: true } });
      if (l) await enrollForStage(event.leadId, l.stageId);
      break;
    }
    case "lead.stage_changed":
      await onLeadStageChanged(event.leadId, event.fromStageId, event.toStageId);
      break;
    case "transaction.reserved": {
      const b = await builtinRule("reservation_created");
      if (b.enabled) {
        await afterReservation(event.transactionId);
        await log(b.rule?.id, "ok", "Documentation tasks created, BNG notified", "Transaction", event.transactionId);
      }
      break;
    }
    case "email.received":
      await stopEnrollments({ leadId: event.leadId, reason: "Lead replied", onlyStopOnReply: true, markReply: true });
      break;
  }
  await runCustomRules(event);
}

async function onLeadCreated(leadId: string) {
  const b = await builtinRule("lead_assignment");
  if (!b.enabled) return;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { developments: true } });
  if (!lead || lead.deletedAt) return;
  let ownerId = lead.ownerId;
  if (!ownerId) {
    const byDev = lead.developments.map((d) => b.config.developmentOwners?.[d.id]).find(Boolean);
    if (b.config.strategy === "by_development" && byDev) ownerId = byDev;
    else {
      const pool: string[] = b.config.userIds?.length ? b.config.userIds : await usersWithPermission("leads:update");
      const active = await prisma.user.findMany({ where: { id: { in: pool }, status: "ACTIVE", deletedAt: null }, select: { id: true }, orderBy: { name: "asc" } });
      ownerId = nextRoundRobin(
        active.map((u) => u.id),
        b.config.lastAssignedId,
      );
      if (ownerId && b.rule) await prisma.automationRule.update({ where: { id: b.rule.id }, data: { config: { ...b.config, lastAssignedId: ownerId } } });
      cache.delete("lead_assignment");
    }
    if (ownerId) {
      await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });
      await logActivity({ type: "SYSTEM", subject: "Owner assigned automatically", leadId });
    }
  }
  if (!ownerId) return;
  await prisma.task.upsert({
    where: { dedupeKey: `first-contact:${leadId}` },
    create: { title: `First contact: ${fullName(lead)}`, dueAt: new Date(Date.now() + (b.config.taskDueHours ?? 24) * 3_600_000), assigneeId: ownerId, leadId, priority: "HIGH", dedupeKey: `first-contact:${leadId}` },
    update: {},
  });
  await notifyUsers([ownerId], { title: `New lead: ${fullName(lead)}`, body: `Source: ${lead.sourceCode.replace(/_/g, " ").toLowerCase()}. Make first contact within ${b.config.taskDueHours ?? 24}h.`, link: `/pipeline/leads/${leadId}`, kind: "LEAD", dedupeKey: `lead-new:${leadId}` });
  await log(b.rule?.id, "ok", `Assigned/notified ${ownerId}`, "Lead", leadId);
}

async function onLeadStageChanged(leadId: string, fromStageId: string | null, toStageId: string) {
  const b = await builtinRule("lead_stage_sequences");
  if (!b.enabled) return;
  // Stop sequences that stop on stage change
  await stopEnrollments({ leadId, reason: "Stage changed", onlyStopOnStageChange: true, exceptStageId: toStageId });
  await enrollForStage(leadId, toStageId);
  void fromStageId;
}

/** Auto-enroll into sequences whose trigger stage is the lead's (new) stage. */
async function enrollForStage(leadId: string, stageId: string) {
  const b = await builtinRule("lead_stage_sequences");
  if (!b.enabled) return;
  const seqs = await prisma.emailSequence.findMany({ where: { triggerStageId: stageId, active: true, deletedAt: null } });
  for (const s of seqs) {
    const r = await enrollLead(s.id, leadId, SYSTEM_CTX).catch((e) => ({ error: (e as Error).message }));
    await log(b.rule?.id, "error" in (r as any) ? "skipped" : "ok", "error" in (r as any) ? (r as any).error : `Enrolled in ${s.name}`, "Lead", leadId);
  }
}

// ── Custom rules ──
async function eventContext(e: DomainEvent): Promise<{ ctx: Record<string, any>; leadId?: string; transactionId?: string } | null> {
  if (e.type === "lead.created" || e.type === "lead.stage_changed") {
    const l = await prisma.lead.findUnique({ where: { id: e.leadId }, include: { stage: true, developments: true, campaign: true } });
    if (!l) return null;
    const from = e.type === "lead.stage_changed" && e.fromStageId ? await prisma.pipelineStage.findUnique({ where: { id: e.fromStageId } }) : null;
    return {
      leadId: l.id,
      ctx: {
        lead: { ...l, stageName: l.stage.name, developmentCodes: l.developments.map((d) => d.code), campaignCode: l.campaign?.code ?? null },
        fromStageName: from?.name ?? null,
      },
    };
  }
  if (e.type === "transaction.reserved" || e.type === "transaction.status_changed" || e.type === "payment.recorded") {
    const t = await prisma.transaction.findUnique({ where: { id: e.transactionId }, include: { development: true, paymentScheme: true } });
    if (!t) return null;
    const p = e.type === "payment.recorded" ? await prisma.payment.findUnique({ where: { id: e.paymentId } }) : null;
    return {
      transactionId: t.id,
      leadId: t.leadId ?? undefined,
      ctx: {
        transaction: { ...t, developmentCode: t.development.code, schemeKind: t.paymentScheme.kind, tcpPesos: Number(t.tcpCents) / 100 },
        from: e.type === "transaction.status_changed" ? e.from : null,
        payment: p ? { ...p, amountPesos: Number(p.amountCents) / 100 } : null,
      },
    };
  }
  return null;
}

async function runCustomRules(e: DomainEvent) {
  const rules = await prisma.automationRule.findMany({ where: { builtInKey: null, enabled: true, trigger: e.type } });
  if (!rules.length) return;
  const ec = await eventContext(e);
  if (!ec) return;
  for (const r of rules) {
    try {
      if (!matchesAll((r.conditions as unknown as Condition[]) ?? [], ec.ctx)) continue;
      for (const a of (r.actions as any[]) ?? []) await runAction(a, ec);
      await log(r.id, "ok", `Ran ${((r.actions as any[]) ?? []).length} action(s)`, ec.transactionId ? "Transaction" : "Lead", ec.transactionId ?? ec.leadId);
    } catch (err) {
      await log(r.id, "error", (err as Error).message, ec.transactionId ? "Transaction" : "Lead", ec.transactionId ?? ec.leadId);
      logger.error({ err, rule: r.id }, "automation rule failed");
    }
  }
}

async function resolveUser(spec: string | undefined, ec: { ctx: Record<string, any> }): Promise<string[]> {
  if (!spec || spec === "owner") return [ec.ctx.lead?.ownerId ?? ec.ctx.transaction?.handlingStaffId].filter(Boolean);
  if (spec === "handler") return [ec.ctx.transaction?.handlingStaffId ?? ec.ctx.lead?.ownerId].filter(Boolean);
  if (spec.startsWith("role:")) return usersWithRoleKey([spec.slice(5)]);
  return [spec];
}

async function runAction(a: { type: string; params: Record<string, string> }, ec: { ctx: Record<string, any>; leadId?: string; transactionId?: string }) {
  const p = a.params ?? {};
  if (a.type === "create_task") {
    const [assignee] = await resolveUser(p.assignTo, ec);
    await prisma.task.create({
      data: { title: p.title || "Follow up", dueAt: new Date(Date.now() + Number(p.dueInHours || 24) * 3_600_000), assigneeId: assignee ?? null, leadId: ec.leadId ?? null, transactionId: ec.transactionId ?? null, priority: (p.priority as any) || "MEDIUM" },
    });
  } else if (a.type === "notify") {
    await notifyUsers(await resolveUser(p.to, ec), { title: p.title || "Automation", body: p.body, link: ec.transactionId ? `/transactions/${ec.transactionId}` : ec.leadId ? `/pipeline/leads/${ec.leadId}` : null, kind: "AUTOMATION" });
  } else if (a.type === "assign_owner" && ec.leadId && p.userId) {
    await prisma.lead.update({ where: { id: ec.leadId }, data: { ownerId: p.userId } });
  } else if (a.type === "enroll_sequence" && ec.leadId && p.sequenceId) {
    await enrollLead(p.sequenceId, ec.leadId, SYSTEM_CTX).catch(() => {});
  }
}

// ── Scheduled scanners ──
export async function scanInactiveLeads() {
  const b = await builtinRule("lead_inactivity");
  if (!b.enabled) return 0;
  const days = Number(b.config.days ?? (await getSettings()).stalledLeadDays);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const leads = await prisma.lead.findMany({ where: { deletedAt: null, lastActivityAt: { lt: cutoff }, stage: { isWon: false, isLost: false } }, take: 500 });
  const managers = await usersWithRoleKey(["SALES_MANAGER"]);
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  let n = 0;
  for (const l of leads) {
    const key = `inactive:${l.id}:${l.lastActivityAt.toISOString().slice(0, 10)}`;
    const existing = await prisma.task.findUnique({ where: { dedupeKey: key } });
    if (existing) continue;
    await prisma.task.create({ data: { title: `Follow up: no activity for ${days}+ days — ${fullName(l)}`, dueAt: new Date(Date.now() + 86_400_000), assigneeId: l.ownerId, leadId: l.id, priority: "MEDIUM", dedupeKey: key } });
    await notifyUsers([l.ownerId, ...managers], { title: `Stale lead: ${fullName(l)}`, body: `No activity since ${formatDay(l.lastActivityAt)}.`, link: `/pipeline/leads/${l.id}`, kind: "LEAD", dedupeKey: `inactive:${l.id}:${week}` });
    n++;
  }
  await log(b.rule?.id, "ok", `${n} stale lead(s)`);
  return n;
}

export async function scanOverdueDocuments() {
  const b = await builtinRule("document_overdue");
  if (!b.enabled) return 0;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const items = await prisma.transactionDocument.findMany({
    where: { required: true, status: { in: ["PENDING", "REJECTED"] }, dueDate: { lt: today }, transaction: { status: { notIn: ["CANCELLED", "TRANSFERRED"] }, deletedAt: null } },
    include: { transaction: { include: { client: true } } },
    take: 1000,
  });
  let n = 0;
  for (const d of items) {
    const key = `doc-overdue:${d.id}`;
    if (await prisma.task.findUnique({ where: { dedupeKey: key } })) continue;
    await prisma.task.create({ data: { title: `Overdue document: ${d.name} (${d.transaction.code})`, dueAt: new Date(), assigneeId: d.transaction.handlingStaffId, transactionId: d.transactionId, clientId: d.transaction.clientId, priority: "HIGH", dedupeKey: key } });
    await notifyUsers([d.transaction.handlingStaffId], { title: `Document overdue — ${d.transaction.code}`, body: `${d.name} for ${fullName(d.transaction.client)} was due ${formatDay(d.dueDate)}.`, link: `/transactions/${d.transactionId}?tab=documents`, kind: "DOCUMENT", dedupeKey: key });
    n++;
  }
  await log(b.rule?.id, "ok", `${n} overdue document(s)`);
  return n;
}

export async function scanPaymentReminders() {
  const b = await builtinRule("payment_reminders");
  if (!b.enabled) return 0;
  const daysBefore = Number(b.config.daysBefore ?? 7);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const soon = new Date(today.getTime() + daysBefore * 86_400_000);
  const items = await prisma.scheduleItem.findMany({
    where: { dueDate: { lte: soon }, transaction: { status: { notIn: ["CANCELLED", "TRANSFERRED", "FULLY_PAID", "TURNED_OVER", "TITLED"] }, deletedAt: null } },
    include: { transaction: { include: { client: true } } },
    orderBy: { dueDate: "asc" },
    take: 2000,
  });
  let n = 0;
  for (const s of items) {
    if (s.paidCents >= s.amountCents) continue;
    if (s.kind === "BALANCE") continue; // loan takeouts are tracked through the status lifecycle
    const overdue = s.dueDate < today;
    const key = `${overdue ? "pay-overdue" : "pay-due"}:${s.id}`;
    if (await prisma.task.findUnique({ where: { dedupeKey: key } })) continue;
    const remaining = s.amountCents - s.paidCents;
    await prisma.task.create({
      data: {
        title: `${overdue ? "Overdue" : "Upcoming"} payment: ${formatPeso(remaining)} — ${fullName(s.transaction.client)} (${s.transaction.code})`,
        description: `${s.label}, due ${formatDay(s.dueDate)}. Internal reminder — follow up with the client/broker.`,
        dueAt: overdue ? new Date() : s.dueDate,
        assigneeId: s.transaction.handlingStaffId,
        transactionId: s.transactionId,
        clientId: s.transaction.clientId,
        priority: overdue ? "HIGH" : "MEDIUM",
        dedupeKey: key,
      },
    });
    if (overdue) await prisma.scheduleItem.update({ where: { id: s.id }, data: { reminderSentAt: new Date() } });
    n++;
  }
  await log(b.rule?.id, "ok", `${n} payment reminder task(s)`);
  return n;
}

export async function scanBrokerExpiry() {
  const b = await builtinRule("broker_expiry");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  // On expiry, accreditation becomes EXPIRED (always enforced)
  const expired = await prisma.broker.findMany({ where: { deletedAt: null, accreditationStatus: "ACCREDITED", OR: [{ prcLicenseExpiry: { lt: today } }, { accreditationExpiry: { lt: today } }] } });
  for (const br of expired) {
    await prisma.broker.update({ where: { id: br.id }, data: { accreditationStatus: "EXPIRED" } });
    await prisma.auditLog.create({ data: { entity: "Broker", entityId: br.id, action: "auto_expire", before: { accreditationStatus: "ACCREDITED" }, after: { accreditationStatus: "EXPIRED" } } });
    await logActivity({ type: "SYSTEM", subject: "Accreditation set to EXPIRED (license/accreditation expiry passed)", brokerId: br.id });
  }
  const expiredFirms = await prisma.brokerage.updateMany({ where: { deletedAt: null, accreditationStatus: "ACCREDITED", accreditationExpiry: { lt: today } }, data: { accreditationStatus: "EXPIRED" } });
  if (!b.enabled) return expired.length + expiredFirms.count;
  const bng = await usersWithRoleKey(["BNG_STAFF"]);
  let n = 0;
  for (const days of (b.config.days as number[]) ?? [60, 30, 7]) {
    const target = new Date(today.getTime() + days * 86_400_000);
    const brokers = await prisma.broker.findMany({ where: { deletedAt: null, OR: [{ prcLicenseExpiry: target }, { accreditationExpiry: target }] } });
    for (const br of brokers) {
      const what = br.prcLicenseExpiry?.getTime() === target.getTime() ? "PRC license" : "accreditation";
      n += await notifyUsers(bng, { title: `${fullName(br)}: ${what} expires in ${days} days`, body: `Expiry: ${formatDay(target)}. Request renewal documents.`, link: `/brokers/${br.id}`, kind: "BROKER", dedupeKey: `broker-exp:${br.id}:${what}:${days}` });
    }
    const firms = await prisma.brokerage.findMany({ where: { deletedAt: null, accreditationExpiry: target } });
    for (const f of firms) n += await notifyUsers(bng, { title: `${f.name}: accreditation expires in ${days} days`, link: `/brokers/brokerages/${f.id}`, kind: "BROKER", dedupeKey: `brokerage-exp:${f.id}:${days}` });
  }
  await log(b.rule?.id, "ok", `${expired.length} expired, ${n} notification(s)`);
  return n;
}
