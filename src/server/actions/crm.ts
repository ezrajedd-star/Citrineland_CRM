"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac/can";
import { normalizeName } from "@/lib/normalize";
import { DomainError } from "@/domain/errors";
import {
  leadSchema,
  overrideBrokerSchema,
  moveStageSchema,
  clientSchema,
  clientPartySchema,
  activitySchema,
  taskSchema,
  brokerageSchema,
  brokerSchema,
} from "@/lib/validation/schemas";
import { createLead, updateLead, overrideBrokerOfRecord, moveLeadStage } from "@/server/leads";
import { convertLeadToClient } from "@/server/clients";
import { findDuplicates, duplicateMessage } from "@/server/duplicates";
import { logActivity } from "@/server/activities";
import { createCalendarEventForActivity } from "@/server/graph/calendar";

// ── Leads ──
export const saveLead = action(["leads:create", "leads:update"], leadSchema, async (input, ctx) => {
  if (!input.id && !can(ctx.user, "leads:create")) throw new DomainError("You can't create leads.");
  if (input.id && !can(ctx.user, "leads:update")) throw new DomainError("You can't edit leads.");
  if (!input.email && !input.mobile) return { ok: false as const, error: "Enter an email or mobile number.", fieldErrors: { mobile: ["Email or mobile is required"] } };
  if (!input.confirmDuplicate) {
    const dups = await findDuplicates({ ...input, excludeLeadId: input.id });
    if (dups.length) return { ok: false as const, error: duplicateMessage(dups) };
  }
  const data = {
    ...input,
    budgetMinCents: input.budgetMin,
    budgetMaxCents: input.budgetMax,
  };
  if (input.id) {
    await updateLead(input.id, data, ctx, { canOverrideBroker: can(ctx.user, "leads:override_broker") });
    revalidatePath(`/pipeline/leads/${input.id}`);
    return { ok: true as const, message: "Lead saved" };
  }
  const lead = await createLead({ ...data, ownerId: input.ownerId ?? ctx.userId }, ctx);
  revalidatePath("/pipeline");
  return { ok: true as const, message: "Lead created", redirect: `/pipeline/leads/${lead.id}` };
});

export const deleteLead = action("leads:delete", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const before = await prisma.lead.findUniqueOrThrow({ where: { id } });
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "Lead", entityId: id, action: "delete", before });
  return { ok: true as const, message: "Lead deleted", redirect: "/pipeline?view=list" };
});

export const overrideBroker = action("leads:override_broker", overrideBrokerSchema, async (input, ctx) => {
  await overrideBrokerOfRecord(input.leadId, input.brokerId, input.reason, ctx);
  revalidatePath(`/pipeline/leads/${input.leadId}`);
  return { ok: true as const, message: "Broker of record updated" };
});

export const moveStage = action("leads:update", moveStageSchema, async (input, ctx) => {
  await moveLeadStage(input, ctx);
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${input.leadId}`);
  return { ok: true as const, message: "Stage updated" };
});

export const convertToClient = action("clients:create", z.object({ leadId: z.string() }), async ({ leadId }, ctx) => {
  const c = await prisma.$transaction((tx) => convertLeadToClient(leadId, ctx, tx));
  return { ok: true as const, message: "Client created", redirect: `/clients/${c.id}` };
});

// ── Clients ──
export const saveClient = action(["clients:create", "clients:update"], clientSchema, async (input, ctx) => {
  if (!input.id && !can(ctx.user, "clients:create")) throw new DomainError("You can't create clients.");
  if (input.id && !can(ctx.user, "clients:update")) throw new DomainError("You can't edit clients.");
  if (!input.confirmDuplicate && !input.id) {
    const dups = (await findDuplicates({ ...input, excludeLeadId: input.leadId })).filter((d) => !(d.kind === "lead" && d.id === input.leadId));
    if (dups.length) return { ok: false as const, error: duplicateMessage(dups) };
  }
  const { id, monthlyIncome, leadId, confirmDuplicate: _c, ...rest } = input;
  const data = {
    ...rest,
    normalizedName: normalizeName(input.firstName, input.lastName),
    monthlyIncomeCents: monthlyIncome != null ? BigInt(monthlyIncome) : null,
  };
  if (id) {
    const before = await prisma.client.findUniqueOrThrow({ where: { id } });
    if (before.brokerId && before.brokerId !== (input.brokerId ?? null) && !can(ctx.user, "leads:override_broker")) throw new DomainError("Changing the broker of record requires the override permission.");
    const after = await prisma.client.update({ where: { id }, data: { ...data, privacyConsentAt: input.privacyConsent && !before.privacyConsent ? new Date() : before.privacyConsentAt } });
    await audit(ctx, { entity: "Client", entityId: id, action: "update", before, after });
    revalidatePath(`/clients/${id}`);
    return { ok: true as const, message: "Client saved" };
  }
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({ data: { ...data, privacyConsentAt: input.privacyConsent ? new Date() : null, createdById: ctx.userId } });
    if (leadId) await tx.lead.update({ where: { id: leadId }, data: { clientId: created.id } });
    await audit(ctx, { entity: "Client", entityId: created.id, action: "create", after: created }, tx);
    return created;
  });
  return { ok: true as const, message: "Client created", redirect: `/clients/${c.id}` };
});

export const deleteClient = action("clients:delete", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const active = await prisma.transaction.count({ where: { clientId: id, deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED"] } } });
  if (active) throw new DomainError("This client has active transactions and can't be deleted.");
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "Client", entityId: id, action: "delete", before });
  return { ok: true as const, message: "Client deleted", redirect: "/clients" };
});

export const saveClientParty = action("clients:update", clientPartySchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.clientParty.findUniqueOrThrow({ where: { id } });
    const after = await prisma.clientParty.update({ where: { id }, data });
    await audit(ctx, { entity: "Client", entityId: input.clientId, action: "update_party", before, after });
  } else {
    const p = await prisma.clientParty.create({ data });
    await audit(ctx, { entity: "Client", entityId: input.clientId, action: "add_party", after: p });
  }
  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true as const, message: "Saved" };
});

export const deleteClientParty = action("clients:update", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const p = await prisma.clientParty.delete({ where: { id } });
  await audit(ctx, { entity: "Client", entityId: p.clientId, action: "remove_party", before: p });
  revalidatePath(`/clients/${p.clientId}`);
  return { ok: true as const, message: "Removed" };
});

// ── Activities ──
export const addActivity = action(null, activitySchema, async (input, ctx) => {
  const target = input.leadId ? "leads:update" : input.clientId ? "clients:update" : input.brokerId ? "brokers:update" : input.transactionId ? "transactions:update" : null;
  if (!target) throw new DomainError("Activity must be attached to a record.");
  if (!can(ctx.user, target as any) && !can(ctx.user, "leads:create")) throw new DomainError("You can't add activities here.");
  const occurredAt = input.occurredAt ?? new Date();
  const act = await logActivity({
    type: input.type,
    subject: input.subject,
    body: input.body,
    occurredAt,
    actorId: ctx.userId,
    leadId: input.leadId,
    clientId: input.clientId,
    brokerId: input.brokerId,
    transactionId: input.transactionId,
    meta: input.location || input.endsAt ? { location: input.location, endsAt: input.endsAt?.toISOString() } : undefined,
  });
  let message = "Logged";
  if ((input.type === "MEETING" || input.type === "SITE_VISIT") && input.createOutlookEvent) {
    const r = await createCalendarEventForActivity(act.id, ctx.userId, { endsAt: input.endsAt, location: input.location, inviteContact: input.inviteContact });
    message = r.ok ? "Logged and added to your Outlook calendar" : `Logged. Outlook event not created: ${r.error}`;
  }
  revalidatePath("/", "layout");
  return { ok: true as const, message };
});

// ── Tasks ──
export const saveTask = action(null, taskSchema, async (input, ctx) => {
  const { id, ...data } = input;
  const assigneeId = data.assigneeId ?? ctx.userId;
  if (assigneeId !== ctx.userId && !can(ctx.user, "tasks:manage_all") && !can(ctx.user, "leads:update")) throw new DomainError("You can only assign tasks to yourself.");
  if (id) {
    const before = await prisma.task.findUniqueOrThrow({ where: { id } });
    if (before.assigneeId !== ctx.userId && before.createdById !== ctx.userId && !can(ctx.user, "tasks:manage_all")) throw new DomainError("You can't edit this task.");
    const after = await prisma.task.update({ where: { id }, data: { ...data, assigneeId } });
    await audit(ctx, { entity: "Task", entityId: id, action: "update", before, after });
  } else {
    const t = await prisma.task.create({ data: { ...data, assigneeId, createdById: ctx.userId } });
    await audit(ctx, { entity: "Task", entityId: t.id, action: "create", after: t });
    if (assigneeId !== ctx.userId) {
      const { notifyUsers } = await import("@/server/notifications");
      await notifyUsers([assigneeId], { title: `New task: ${t.title}`, body: `Assigned by ${ctx.user.name}`, link: "/tasks", kind: "TASK" });
    }
  }
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Task saved" };
});

export const setTaskStatus = action(null, z.object({ id: z.string(), status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]) }), async ({ id, status }, ctx) => {
  const t = await prisma.task.findUniqueOrThrow({ where: { id } });
  if (t.assigneeId !== ctx.userId && t.createdById !== ctx.userId && !can(ctx.user, "tasks:manage_all")) throw new DomainError("You can't update this task.");
  const after = await prisma.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  if (status === "DONE") {
    await logActivity({ type: "TASK", subject: `Task completed: ${t.title}`, actorId: ctx.userId, leadId: t.leadId, clientId: t.clientId, brokerId: t.brokerId, transactionId: t.transactionId });
  }
  await audit(ctx, { entity: "Task", entityId: id, action: `status:${status.toLowerCase()}`, before: t, after });
  revalidatePath("/", "layout");
  return { ok: true as const, message: status === "DONE" ? "Task completed" : "Task updated" };
});

// ── Brokers ──
export const saveBrokerage = action(["brokers:create", "brokers:update"], brokerageSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.brokerage.findUniqueOrThrow({ where: { id } });
    const after = await prisma.brokerage.update({ where: { id }, data });
    await audit(ctx, { entity: "Brokerage", entityId: id, action: "update", before, after });
    revalidatePath(`/brokers/brokerages/${id}`);
    return { ok: true as const, message: "Brokerage saved" };
  }
  const b = await prisma.brokerage.create({ data: { ...data, createdById: ctx.userId } });
  await audit(ctx, { entity: "Brokerage", entityId: b.id, action: "create", after: b });
  return { ok: true as const, message: "Brokerage created", redirect: `/brokers/brokerages/${b.id}` };
});

export const saveBroker = action(["brokers:create", "brokers:update"], brokerSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.broker.findUniqueOrThrow({ where: { id } });
    const after = await prisma.broker.update({ where: { id }, data });
    await audit(ctx, { entity: "Broker", entityId: id, action: "update", before, after });
    revalidatePath(`/brokers/${id}`);
    return { ok: true as const, message: "Broker saved" };
  }
  const b = await prisma.broker.create({ data: { ...data, createdById: ctx.userId } });
  await audit(ctx, { entity: "Broker", entityId: b.id, action: "create", after: b });
  return { ok: true as const, message: "Broker created", redirect: `/brokers/${b.id}` };
});

export const deleteBroker = action("brokers:delete", z.object({ id: z.string(), kind: z.enum(["broker", "brokerage"]) }), async ({ id, kind }, ctx) => {
  if (kind === "broker") {
    const before = await prisma.broker.findUniqueOrThrow({ where: { id } });
    await prisma.broker.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(ctx, { entity: "Broker", entityId: id, action: "delete", before });
  } else {
    const active = await prisma.broker.count({ where: { brokerageId: id, deletedAt: null } });
    if (active) throw new DomainError("Remove or move this brokerage's brokers first.");
    const before = await prisma.brokerage.findUniqueOrThrow({ where: { id } });
    await prisma.brokerage.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(ctx, { entity: "Brokerage", entityId: id, action: "delete", before });
  }
  return { ok: true as const, message: "Deleted", redirect: "/brokers" };
});
