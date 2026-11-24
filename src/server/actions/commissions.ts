"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { commissionRuleSchema, commissionAdjustmentSchema, trancheActionSchema, quotaSchema } from "@/lib/validation/schemas";
import { approveTranches, releaseTranches, addAdjustment } from "@/server/commissions";
import { DomainError } from "@/domain/errors";

export const approve = action("commissions:approve", trancheActionSchema, async ({ trancheIds }, ctx) => {
  const n = await approveTranches(trancheIds, ctx);
  revalidatePath("/commissions");
  return { ok: true as const, message: `${n} tranche(s) approved` };
});

export const release = action("commissions:release", trancheActionSchema, async ({ trancheIds, reference }, ctx) => {
  const n = await releaseTranches(trancheIds, reference ?? "", ctx);
  revalidatePath("/commissions");
  return { ok: true as const, message: `${n} tranche(s) released` };
});

export const adjust = action("commissions:adjust", commissionAdjustmentSchema, async (input, ctx) => {
  const l = await prisma.commissionLedger.findUniqueOrThrow({ where: { id: input.ledgerId } });
  await addAdjustment(input.ledgerId, Math.round(input.amount * 100), input.reason, ctx);
  revalidatePath(`/transactions/${l.transactionId}`);
  return { ok: true as const, message: input.amount < 0 ? "Clawback recorded" : "Adjustment recorded" };
});

export const saveCommissionRule = action("commissions:manage_rules", commissionRuleSchema, async (input, ctx) => {
  const { id, tranches, ...data } = input;
  const payload = { ...data, tranches: tranches as any };
  if (id) {
    const before = await prisma.commissionRule.findUniqueOrThrow({ where: { id } });
    const after = await prisma.commissionRule.update({ where: { id }, data: payload });
    await audit(ctx, { entity: "CommissionRule", entityId: id, action: "update", before, after });
  } else {
    const r = await prisma.commissionRule.create({ data: { ...payload, createdById: ctx.userId } });
    await audit(ctx, { entity: "CommissionRule", entityId: r.id, action: "create", after: r });
  }
  revalidatePath("/admin/commission-rules");
  return { ok: true as const, message: "Rule saved (applies to new reservations)" };
});

export const deleteCommissionRule = action("commissions:manage_rules", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const before = await prisma.commissionRule.findUniqueOrThrow({ where: { id } });
  const used = await prisma.commissionLedger.count({ where: { ruleId: id } });
  if (used) await prisma.commissionRule.update({ where: { id }, data: { active: false } });
  else await prisma.commissionRule.delete({ where: { id } });
  await audit(ctx, { entity: "CommissionRule", entityId: id, action: used ? "deactivate" : "delete", before });
  revalidatePath("/admin/commission-rules");
  return { ok: true as const, message: used ? "Rule is in use — deactivated" : "Rule deleted" };
});


export const saveQuota = action("quotas:manage", quotaSchema, async (input, ctx) => {
  const { id, value, ...rest } = input;
  if (rest.targetType === "STAFF" && !rest.userId) throw new DomainError("Select the staff member.");
  if (rest.targetType === "BROKER" && !rest.brokerId) throw new DomainError("Select the broker.");
  if (rest.targetType === "BROKERAGE" && !rest.brokerageId) throw new DomainError("Select the brokerage.");
  if (rest.units == null && value == null) throw new DomainError("Enter a units and/or value target.");
  const d = rest.periodStart;
  const periodStart = new Date(Date.UTC(d.getUTCFullYear(), rest.periodType === "QUARTER" ? Math.floor(d.getUTCMonth() / 3) * 3 : d.getUTCMonth(), 1));
  const data = {
    ...rest,
    periodStart,
    userId: rest.targetType === "STAFF" ? rest.userId : null,
    brokerId: rest.targetType === "BROKER" ? rest.brokerId : null,
    brokerageId: rest.targetType === "BROKERAGE" ? rest.brokerageId : null,
    valueCents: value != null ? BigInt(value) : null,
  };
  if (id) await prisma.quota.update({ where: { id }, data });
  else await prisma.quota.create({ data: { ...data, createdById: ctx.userId } });
  await audit(ctx, { entity: "Quota", entityId: id ?? "new", action: id ? "update" : "create", after: data });
  revalidatePath("/admin/quotas");
  return { ok: true as const, message: "Quota saved" };
});

export const deleteQuota = action("quotas:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const q = await prisma.quota.delete({ where: { id } });
  await audit(ctx, { entity: "Quota", entityId: id, action: "delete", before: q });
  revalidatePath("/admin/quotas");
  return { ok: true as const, message: "Quota deleted" };
});
