"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { commissionRuleSchema, commissionAdjustmentSchema, trancheActionSchema } from "@/lib/validation/schemas";
import { approveTranches, releaseTranches, addAdjustment } from "@/server/commissions";

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
