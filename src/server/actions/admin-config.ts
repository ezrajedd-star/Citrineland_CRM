"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { DomainError } from "@/domain/errors";
import { stageSchema, picklistSchema, docTemplateItemSchema } from "@/lib/validation/schemas";
import { saveSettings, settingsSchema } from "@/lib/settings";

export const saveStage = action("pipeline:manage", stageSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (data.isWon && data.isLost) throw new DomainError("A stage can't be both won and lost.");
  if (id) {
    const before = await prisma.pipelineStage.findUniqueOrThrow({ where: { id } });
    const after = await prisma.pipelineStage.update({ where: { id }, data });
    await audit(ctx, { entity: "PipelineStage", entityId: id, action: "update", before, after });
  } else {
    const max = await prisma.pipelineStage.aggregate({ _max: { order: true } });
    const s = await prisma.pipelineStage.create({ data: { ...data, order: (max._max.order ?? 0) + 1 } });
    await audit(ctx, { entity: "PipelineStage", entityId: s.id, action: "create", after: s });
  }
  if (data.isWon) {
    const won = await prisma.pipelineStage.count({ where: { isWon: true, active: true } });
    if (won > 1) throw new DomainError("Only one active stage can be the won stage.");
  }
  revalidatePath("/admin/pipeline");
  return { ok: true as const, message: "Stage saved" };
});

export const reorderStages = action("pipeline:manage", z.object({ ids: z.array(z.string()) }), async ({ ids }, ctx) => {
  await prisma.$transaction(ids.map((id, i) => prisma.pipelineStage.update({ where: { id }, data: { order: i + 1 } })));
  await audit(ctx, { entity: "PipelineStage", entityId: "*", action: "reorder", after: { ids } });
  revalidatePath("/admin/pipeline");
  return { ok: true as const, message: "Order saved" };
});

export const deleteStage = action("pipeline:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const count = await prisma.lead.count({ where: { stageId: id, deletedAt: null } });
  if (count) throw new DomainError(`${count} lead(s) are in this stage. Move them first or deactivate the stage.`);
  const hist = await prisma.leadStageHistory.count({ where: { OR: [{ toStageId: id }, { fromStageId: id }] } });
  const before = await prisma.pipelineStage.findUniqueOrThrow({ where: { id } });
  if (hist) await prisma.pipelineStage.update({ where: { id }, data: { active: false } });
  else await prisma.pipelineStage.delete({ where: { id } });
  await audit(ctx, { entity: "PipelineStage", entityId: id, action: hist ? "deactivate" : "delete", before });
  revalidatePath("/admin/pipeline");
  return { ok: true as const, message: hist ? "Stage has history — deactivated instead" : "Stage deleted" };
});

export const savePicklist = action("settings:update", picklistSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.picklist.findUniqueOrThrow({ where: { id } });
    const after = await prisma.picklist.update({ where: { id }, data: { label: data.label, order: data.order, active: data.active } });
    await audit(ctx, { entity: "Picklist", entityId: id, action: "update", before, after });
  } else {
    const p = await prisma.picklist.create({ data });
    await audit(ctx, { entity: "Picklist", entityId: p.id, action: "create", after: p });
  }
  revalidatePath("/admin/picklists");
  return { ok: true as const, message: "Saved" };
});

export const saveDocTemplateItem = action("settings:update", docTemplateItemSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.documentTemplateItem.findUniqueOrThrow({ where: { id } });
    const after = await prisma.documentTemplateItem.update({ where: { id }, data });
    await audit(ctx, { entity: "DocumentTemplateItem", entityId: id, action: "update", before, after });
  } else {
    const t = await prisma.documentTemplateItem.create({ data });
    await audit(ctx, { entity: "DocumentTemplateItem", entityId: t.id, action: "create", after: t });
  }
  revalidatePath("/admin/document-templates");
  return { ok: true as const, message: "Saved" };
});

export const updateSettings = action("settings:update", settingsSchema, async (input, ctx) => {
  const { getSettings } = await import("@/lib/settings");
  const before = await getSettings();
  const after = await saveSettings(input, ctx.userId);
  await audit(ctx, { entity: "Setting", entityId: "app", action: "update", before, after });
  revalidatePath("/admin/settings");
  return { ok: true as const, message: "Settings saved" };
});
