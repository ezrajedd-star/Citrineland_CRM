"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action, toActionError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac/can";
import { getCurrentUser } from "@/lib/session";
import { clientIp } from "@/lib/request";
import { computationSchema, reservationSchema, paymentSchema, voidPaymentSchema, statusChangeSchema, cancelSchema, transferSchema, checklistUpdateSchema } from "@/lib/validation/schemas";
import { DomainError } from "@/domain/errors";
import { quote, saveComputation } from "@/server/computations";
import { createReservation, changeTransactionStatus, cancelTransaction, transferTransaction, recordPayment, voidPayment, macedaPreview } from "@/server/transactions";
import { previewPaymentImport, commitPaymentImport, parsePaymentCsv, type PaymentPreviewRow } from "@/server/import-payments";
import { logActivity } from "@/server/activities";
import type { ComputationResult } from "@/domain/pricing/computation";
import type { TxStatus } from "@/domain/transactions/state-machine";

/** Live preview for the quote builder (no persistence). */
export const previewQuote = action(["computations:create", "transactions:create"], computationSchema.extend({ parkingSlotIds: z.array(z.string()).default([]) }), async (input) => {
  const { result } = await quote({ unitId: input.unitId, parkingSlotIds: input.parkingSlotIds.length ? input.parkingSlotIds : input.parkingSlotId ? [input.parkingSlotId] : [], paymentSchemeId: input.paymentSchemeId, discountPct: input.discountPct, discountAmountCents: input.discountAmount });
  return result as ComputationResult;
});

export const createComputation = action("computations:create", computationSchema.extend({ parkingSlotIds: z.array(z.string()).default([]) }), async (input, ctx) => {
  const c = await saveComputation(
    {
      unitId: input.unitId,
      parkingSlotIds: input.parkingSlotIds.length ? input.parkingSlotIds : input.parkingSlotId ? [input.parkingSlotId] : [],
      paymentSchemeId: input.paymentSchemeId,
      discountPct: input.discountPct,
      discountAmountCents: input.discountAmount,
      leadId: input.leadId,
      clientId: input.clientId,
    },
    ctx,
  );
  return { ok: true as const, message: `Computation v${c.version} saved`, redirect: `/computations/${c.id}` };
});

export const reserve = action("transactions:create", reservationSchema, async (input, ctx) => {
  if (input.discountPct || input.discountAmount) {
    if (!can(ctx.user, "transactions:update")) throw new DomainError("You can't apply discounts.");
  }
  const t = await createReservation({ ...input, discountAmountCents: input.discountAmount, paymentMethod: input.paymentMethod }, ctx);
  revalidatePath("/inventory");
  revalidatePath("/pipeline");
  return { ok: true as const, message: `Reserved — ${t.code}`, redirect: `/transactions/${t.id}` };
});

export const changeStatus = action("transactions:update", statusChangeSchema, async (input, ctx) => {
  await changeTransactionStatus({ transactionId: input.transactionId, toStatus: input.toStatus as TxStatus, note: input.note, effectiveDate: input.effectiveDate }, ctx);
  revalidatePath(`/transactions/${input.transactionId}`);
  return { ok: true as const, message: "Status updated" };
});

export const cancel = action("transactions:cancel", cancelSchema, async (input, ctx) => {
  await cancelTransaction({ transactionId: input.transactionId, reason: input.reason }, ctx);
  revalidatePath(`/transactions/${input.transactionId}`);
  revalidatePath("/inventory");
  return { ok: true as const, message: "Transaction cancelled; inventory released" };
});

export const transfer = action("transactions:transfer", transferSchema, async (input, ctx) => {
  const nt = await transferTransaction(input, ctx);
  revalidatePath("/inventory");
  return { ok: true as const, message: `Transferred to ${nt.code}`, redirect: `/transactions/${nt.id}` };
});

export const getMacedaPreview = action("transactions:view", z.object({ transactionId: z.string() }), async ({ transactionId }) => macedaPreview(transactionId));

export const addPayment = action("payments:create", paymentSchema, async (input, ctx) => {
  const r = await recordPayment({ ...input, amountCents: input.amount }, ctx);
  revalidatePath(`/transactions/${input.transactionId}`);
  return { ok: true as const, message: r.dueTranches.length ? `Payment recorded — ${r.dueTranches.length} commission tranche(s) now due` : "Payment recorded" };
});

export const voidPaymentAction = action("payments:void", voidPaymentSchema, async (input, ctx) => {
  const p = await voidPayment(input.paymentId, input.reason, ctx);
  revalidatePath(`/transactions/${p.transactionId}`);
  return { ok: true as const, message: "Payment voided" };
});

export async function previewPaymentsCsv(fd: FormData): Promise<ActionResult<{ rows: PaymentPreviewRow[]; raw: Record<string, string>[] }>> {
  try {
    const user = await getCurrentUser();
    if (!user || !can(user, "payments:import")) throw new DomainError("You don't have permission to import payments.");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new DomainError("Choose a CSV file.");
    const raw = parsePaymentCsv(await file.text());
    if (raw.length > 2000) throw new DomainError("Import up to 2,000 rows at a time.");
    return { ok: true, data: { rows: await previewPaymentImport(raw), raw } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function commitPaymentsCsv(raw: Record<string, string>[]): Promise<ActionResult<{ imported: number; failed: { line: number; error: string }[] }>> {
  try {
    const user = await getCurrentUser();
    if (!user || !can(user, "payments:import")) throw new DomainError("You don't have permission to import payments.");
    const r = await commitPaymentImport(raw, { userId: user.id, ip: await clientIp() });
    revalidatePath("/transactions");
    return { ok: true, data: r, message: `${r.imported} payment(s) imported${r.failed.length ? `, ${r.failed.length} failed` : ""}` };
  } catch (e) {
    return toActionError(e);
  }
}

export const updateChecklistItem = action("documents:update", checklistUpdateSchema, async (input, ctx) => {
  const before = await prisma.transactionDocument.findUniqueOrThrow({ where: { id: input.id } });
  if ((input.status === "VERIFIED" || input.status === "REJECTED") && !can(ctx.user, "documents:verify")) throw new DomainError("You can't verify documents.");
  if (input.status === "REJECTED" && !input.rejectReason) return { ok: false as const, error: "Enter why the document was rejected.", fieldErrors: { rejectReason: ["Required"] } };
  const after = await prisma.transactionDocument.update({
    where: { id: input.id },
    data: {
      status: input.status,
      dueDate: input.dueDate ?? before.dueDate,
      rejectReason: input.status === "REJECTED" ? input.rejectReason : null,
      ...(input.status === "VERIFIED" ? { verifiedById: ctx.userId, verifiedAt: new Date() } : {}),
    },
  });
  if (input.status === "VERIFIED" || input.status === "SUBMITTED") {
    await prisma.task.updateMany({ where: { dedupeKey: { in: [`doc:${input.id}`, `doc-overdue:${input.id}`] }, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: new Date() } });
  }
  await logActivity({ type: "SYSTEM", subject: `Document “${before.name}”: ${input.status.toLowerCase()}`, body: input.rejectReason, transactionId: before.transactionId, actorId: ctx.userId });
  await audit(ctx, { entity: "TransactionDocument", entityId: input.id, action: "update", before, after });
  revalidatePath(`/transactions/${before.transactionId}`);
  return { ok: true as const, message: "Checklist updated" };
});

export const deleteTransaction = action("transactions:delete", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id } });
  if (t.status !== "CANCELLED" && t.status !== "TRANSFERRED") throw new DomainError("Only cancelled or transferred transactions can be deleted. Cancel it first.");
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "Transaction", entityId: id, action: "delete", before: t });
  return { ok: true as const, message: "Transaction deleted", redirect: "/transactions" };
});

export async function macedaForTransaction(transactionId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user, "transactions:view")) throw new DomainError("Forbidden");
  return macedaPreview(transactionId);
}
