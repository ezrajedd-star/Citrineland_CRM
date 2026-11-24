"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { campaignSchema, emailTemplateSchema, sequenceSchema, enrollSchema, automationRuleSchema } from "@/lib/validation/schemas";
import { DomainError } from "@/domain/errors";
import { enrollLead, stopEnrollments } from "@/server/sequences";
import { BUILTINS, type BuiltinKey } from "@/server/automation/engine";

export const saveCampaign = action("campaigns:manage", campaignSchema, async (input, ctx) => {
  const { id, budget, ...rest } = input;
  const data = { ...rest, budgetCents: BigInt(budget) };
  if (id) {
    const before = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    const after = await prisma.campaign.update({ where: { id }, data });
    await audit(ctx, { entity: "Campaign", entityId: id, action: "update", before, after });
  } else {
    const c = await prisma.campaign.create({ data: { ...data, createdById: ctx.userId } });
    await audit(ctx, { entity: "Campaign", entityId: c.id, action: "create", after: c });
  }
  revalidatePath("/marketing");
  return { ok: true as const, message: "Campaign saved" };
});

export const deleteCampaign = action("campaigns:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const before = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  await prisma.campaign.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit(ctx, { entity: "Campaign", entityId: id, action: "delete", before });
  revalidatePath("/marketing");
  return { ok: true as const, message: "Campaign removed" };
});

export const saveTemplate = action("sequences:manage", emailTemplateSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.emailTemplate.findUniqueOrThrow({ where: { id } });
    const after = await prisma.emailTemplate.update({ where: { id }, data });
    await audit(ctx, { entity: "EmailTemplate", entityId: id, action: "update", before, after });
  } else {
    const t = await prisma.emailTemplate.create({ data: { ...data, createdById: ctx.userId } });
    await audit(ctx, { entity: "EmailTemplate", entityId: t.id, action: "create", after: t });
  }
  revalidatePath("/marketing");
  return { ok: true as const, message: "Template saved" };
});

export const deleteTemplate = action("sequences:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const used = await prisma.sequenceStep.count({ where: { templateId: id, sequence: { deletedAt: null } } });
  if (used) throw new DomainError("Template is used by a sequence.");
  await prisma.emailTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "EmailTemplate", entityId: id, action: "delete" });
  revalidatePath("/marketing");
  return { ok: true as const, message: "Template removed" };
});

export const saveSequence = action("sequences:manage", sequenceSchema, async (input, ctx) => {
  const { id, steps, ...data } = input;
  const seq = await prisma.$transaction(async (tx) => {
    const s = id ? await tx.emailSequence.update({ where: { id }, data }) : await tx.emailSequence.create({ data: { ...data, createdById: ctx.userId } });
    // Replace steps only if no sends reference them; otherwise update in place by order
    const existing = await tx.sequenceStep.findMany({ where: { sequenceId: s.id }, include: { _count: { select: { sends: true } } } });
    for (const [i, st] of steps.entries()) {
      const order = i + 1;
      const cur = existing.find((e) => e.order === order);
      if (cur) await tx.sequenceStep.update({ where: { id: cur.id }, data: { delayDays: st.delayDays, templateId: st.templateId } });
      else await tx.sequenceStep.create({ data: { sequenceId: s.id, order, delayDays: st.delayDays, templateId: st.templateId } });
    }
    for (const e of existing.filter((e) => e.order > steps.length)) {
      if (e._count.sends) throw new DomainError("Can't remove a step that has already been sent. Deactivate the sequence instead.");
      await tx.sequenceStep.delete({ where: { id: e.id } });
    }
    await audit(ctx, { entity: "EmailSequence", entityId: s.id, action: id ? "update" : "create", after: { ...s, steps } }, tx);
    return s;
  });
  revalidatePath("/marketing");
  return { ok: true as const, message: "Sequence saved", redirect: `/marketing/sequences/${seq.id}` };
});

export const enrollAction = action("leads:update", enrollSchema, async ({ leadId, sequenceId }, ctx) => {
  await enrollLead(sequenceId, leadId, ctx);
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true as const, message: "Enrolled in sequence" };
});

export const stopEnrollmentAction = action("leads:update", z.object({ enrollmentId: z.string(), leadId: z.string() }), async ({ enrollmentId, leadId }, ctx) => {
  await stopEnrollments({ leadId, enrollmentId, reason: `Stopped by ${ctx.user.name}` });
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true as const, message: "Enrollment stopped" };
});

// ── Automations ──
export const toggleBuiltin = action("automations:manage", z.object({ key: z.string(), enabled: z.boolean() }), async ({ key, enabled }, ctx) => {
  const def = BUILTINS[key as BuiltinKey];
  if (!def) throw new DomainError("Unknown automation");
  const r = await prisma.automationRule.upsert({
    where: { builtInKey: key },
    create: { builtInKey: key, name: def.name, trigger: def.trigger, description: def.description, enabled, config: def.config as any, createdById: ctx.userId },
    update: { enabled },
  });
  await audit(ctx, { entity: "AutomationRule", entityId: r.id, action: enabled ? "enable" : "disable" });
  revalidatePath("/admin/automations");
  return { ok: true as const, message: enabled ? "Enabled" : "Disabled" };
});

export const saveBuiltinConfig = action("automations:manage", z.object({ key: z.string(), config: z.record(z.any()) }), async ({ key, config }, ctx) => {
  const def = BUILTINS[key as BuiltinKey];
  if (!def) throw new DomainError("Unknown automation");
  const before = await prisma.automationRule.findUnique({ where: { builtInKey: key } });
  const merged = { ...def.config, ...((before?.config as object) ?? {}), ...config };
  const r = await prisma.automationRule.upsert({
    where: { builtInKey: key },
    create: { builtInKey: key, name: def.name, trigger: def.trigger, description: def.description, config: merged as any, createdById: ctx.userId },
    update: { config: merged as any },
  });
  await audit(ctx, { entity: "AutomationRule", entityId: r.id, action: "update_config", before: before?.config, after: merged });
  revalidatePath("/admin/automations");
  return { ok: true as const, message: "Saved" };
});

export const saveAutomationRule = action("automations:manage", automationRuleSchema, async (input, ctx) => {
  const { id, conditions, actions, ...data } = input;
  const payload = { ...data, conditions: conditions as any, actions: actions as any };
  if (id) {
    const before = await prisma.automationRule.findUniqueOrThrow({ where: { id } });
    if (before.builtInKey) throw new DomainError("Built-in automations are configured separately.");
    const after = await prisma.automationRule.update({ where: { id }, data: payload });
    await audit(ctx, { entity: "AutomationRule", entityId: id, action: "update", before, after });
  } else {
    const r = await prisma.automationRule.create({ data: { ...payload, createdById: ctx.userId } });
    await audit(ctx, { entity: "AutomationRule", entityId: r.id, action: "create", after: r });
  }
  revalidatePath("/admin/automations");
  return { ok: true as const, message: "Rule saved" };
});

export const deleteAutomationRule = action("automations:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const r = await prisma.automationRule.findUniqueOrThrow({ where: { id } });
  if (r.builtInKey) throw new DomainError("Built-in automations can be disabled but not deleted.");
  await prisma.automationRule.delete({ where: { id } });
  await audit(ctx, { entity: "AutomationRule", entityId: id, action: "delete", before: r });
  revalidatePath("/admin/automations");
  return { ok: true as const, message: "Rule deleted" };
});
