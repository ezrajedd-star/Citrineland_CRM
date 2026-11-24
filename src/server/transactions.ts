import type { Prisma, TransactionStatus } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { fullName } from "@/lib/utils";
import { formatPeso } from "@/lib/money";
import { manilaToday } from "@/lib/format";
import { DomainError } from "@/domain/errors";
import { generateSchedule, addDays } from "@/domain/payments/schedule";
import { allocatePayments, summarizeCollections } from "@/domain/payments/allocation";
import { assertTransition, ACTIVE_TX_STATUSES, STATUS_DATE_FIELD, type TxStatus } from "@/domain/transactions/state-machine";
import { checkParkingEligibility } from "@/domain/parking";
import { computeMaceda, type MacedaResult } from "@/domain/maceda";
import { applyInventoryEvent, lockItem, type ItemRef } from "./inventory";
import { quote } from "./computations";
import { convertLeadToClient } from "./clients";
import { logActivity } from "./activities";
import { currentPriceListVersion } from "./price-lists";
import { createLedgerForTransaction, evaluateTranches, forfeitUnreleased } from "./commissions";
import { notifyUsers, usersWithRoleKey } from "./notifications";
import { emit } from "./events";

export interface ReservationInput {
  leadId?: string | null;
  clientId?: string | null;
  unitId?: string | null;
  parkingSlotIds: string[];
  holdId?: string | null;
  paymentSchemeId: string;
  brokerId?: string | null;
  handlingStaffId?: string | null;
  discountPct?: number | null;
  discountAmountCents?: number | null;
  reservationDate: Date;
  firstDueDate?: Date | null;
  reservationFeePaid?: boolean;
  orNumber?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

async function nextTransactionCode(tx: Tx, date: Date) {
  const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('transaction_code_seq')`;
  return `TX-${date.getUTCFullYear()}-${String(nextval).padStart(5, "0")}`;
}

/** Units the client holds in active (reserved or sold, not cancelled) transactions */
async function ownedUnitLocations(tx: Tx, clientId: string) {
  const items = await tx.transactionItem.findMany({
    where: { kind: "UNIT", active: true, transaction: { clientId, status: { in: ACTIVE_TX_STATUSES as TransactionStatus[] }, deletedAt: null } },
    include: { unit: { select: { developmentId: true, sectionId: true } } },
  });
  return items.filter((i) => i.unit).map((i) => ({ developmentId: i.unit!.developmentId, sectionId: i.unit!.sectionId }));
}

/**
 * Create a reservation. Inventory rows are locked (SELECT … FOR UPDATE) inside one DB transaction,
 * so two users can never reserve the same unit: the second waits, then sees RESERVED and fails.
 */
export async function createReservation(input: ReservationInput, ctx: ActorCtx & { userId: string }) {
  if (!input.unitId && !input.parkingSlotIds.length) throw new DomainError("Select a unit and/or parking slot.");
  if (!input.leadId && !input.clientId) throw new DomainError("Select the buyer (lead or client).");
  const settings = await getSettings();

  const created = await prisma.$transaction(
    async (tx) => {
      // 1) Lock inventory in a deterministic order (avoids deadlocks between concurrent bundles)
      const refs: ItemRef[] = [...(input.unitId ? [{ kind: "UNIT" as const, id: input.unitId }] : []), ...input.parkingSlotIds.map((id) => ({ kind: "PARKING" as const, id }))].sort((a, b) =>
        (a.kind + a.id).localeCompare(b.kind + b.id),
      );
      const locked = [];
      for (const r of refs) locked.push(await lockItem(tx, r));

      // 2) Availability: AVAILABLE, or ON_HOLD by the hold referenced in this reservation
      const hold = input.holdId ? await tx.hold.findUnique({ where: { id: input.holdId } }) : null;
      for (const it of locked) {
        if (it.status === "AVAILABLE") continue;
        if (it.status === "ON_HOLD") {
          const activeHold = await tx.hold.findFirst({ where: { status: "ACTIVE", ...(it.kind === "UNIT" ? { unitId: it.id } : { parkingSlotId: it.id }) }, include: { placedBy: { select: { name: true } } } });
          if (activeHold && hold && activeHold.id === hold.id) continue;
          throw new DomainError(`${it.code} is on hold${activeHold ? ` by ${activeHold.placedBy.name}` : ""}. Reserve it from that hold or ask the holder to release it.`);
        }
        throw new DomainError(`${it.code} is no longer available (${it.status.replace("_", " ").toLowerCase()}).`);
      }

      // 3) Buyer
      let clientId = input.clientId ?? null;
      let lead = input.leadId ? await tx.lead.findUnique({ where: { id: input.leadId } }) : null;
      if (!clientId && lead) clientId = (await convertLeadToClient(lead.id, ctx, tx)).id;
      if (!clientId) throw new DomainError("Buyer not found.");
      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
      if (!lead) lead = await tx.lead.findFirst({ where: { clientId, deletedAt: null, stage: { isWon: false, isLost: false } }, orderBy: { updatedAt: "desc" } });

      // 4) Parking eligibility rule
      const slotItems = locked.filter((l) => l.kind === "PARKING");
      if (slotItems.length) {
        const owned = await ownedUnitLocations(tx, clientId);
        const bundled = locked.filter((l) => l.kind === "UNIT").map((u) => ({ developmentId: u.developmentId, sectionId: u.sectionId }));
        for (const s of slotItems) {
          const r = checkParkingEligibility({ requiresUnitOwnership: settings.parkingRequiresUnitOwnership, slot: { developmentId: s.developmentId, sectionId: s.sectionId }, ownedUnits: owned, bundledUnits: bundled });
          if (!r.eligible) throw new DomainError(`${s.code}: ${r.reason}`);
        }
      }

      // 5) Price snapshot (current list prices at the moment of reservation)
      const q = await quote({ unitId: input.unitId, parkingSlotIds: input.parkingSlotIds, paymentSchemeId: input.paymentSchemeId, discountPct: input.discountPct, discountAmountCents: input.discountAmountCents }, tx);
      const developmentId = q.items[0].developmentId;
      const plVersion = await currentPriceListVersion(developmentId, tx);
      const brokerId = input.brokerId ?? lead?.brokerId ?? client.brokerId ?? null;
      const broker = brokerId ? await tx.broker.findUnique({ where: { id: brokerId } }) : null;
      if (broker && broker.accreditationStatus !== "ACCREDITED") throw new DomainError(`Broker ${fullName(broker)} is not accredited (${broker.accreditationStatus.toLowerCase()}).`);

      const code = await nextTransactionCode(tx, input.reservationDate);
      const r = q.result;
      const t = await tx.transaction.create({
        data: {
          code,
          clientId,
          leadId: lead?.id ?? null,
          developmentId,
          brokerId,
          brokerageId: broker?.brokerageId ?? null,
          handlingStaffId: input.handlingStaffId ?? ctx.userId,
          status: "RESERVED",
          paymentSchemeId: input.paymentSchemeId,
          schemeSnapshot: { scheme: q.scheme, vat: q.settings.vat, miscFees: q.settings.miscFees, financingDefaults: q.settings.financingDefaults } as any,
          pricingSnapshot: r as any,
          listPriceCents: BigInt(r.listPriceCents),
          discountCents: BigInt(r.totalDiscountCents),
          netSellingPriceCents: BigInt(r.netSellingPriceCents),
          vatCents: BigInt(r.vatCents),
          miscFeesCents: BigInt(r.miscFeesCents),
          tcpCents: BigInt(r.tcpCents),
          reservationFeeCents: BigInt(r.reservationFeeCents),
          downpaymentCents: BigInt(r.dpGrossCents),
          balanceCents: BigInt(r.balanceCents),
          financing: r.financing,
          reservedAt: input.reservationDate,
          notes: input.notes ?? null,
          createdById: ctx.userId,
          items: { create: q.items.map((i) => ({ kind: i.kind, unitId: i.kind === "UNIT" ? i.id : null, parkingSlotId: i.kind === "PARKING" ? i.id : null, listPriceCents: BigInt(i.listPriceCents), priceListVersion: plVersion })) },
          statusLogs: { create: { fromStatus: null, toStatus: "RESERVED", actorId: ctx.userId, note: "Reservation created" } },
        },
      });

      // 6) Inventory → RESERVED, holds converted
      for (const it of locked) await applyInventoryEvent(tx, { kind: it.kind, id: it.id }, "RESERVE", ctx, `Reserved in ${code}`, it);
      await tx.hold.updateMany({
        where: { status: "ACTIVE", OR: [...(input.unitId ? [{ unitId: input.unitId }] : []), ...(input.parkingSlotIds.length ? [{ parkingSlotId: { in: input.parkingSlotIds } }] : [])] },
        data: { status: "CONVERTED", releasedAt: new Date(), releaseReason: `Reserved in ${code}` },
      });

      // 7) Payment schedule
      const schedule = generateSchedule(r, q.scheme, { reservationDate: input.reservationDate, firstDueDate: input.firstDueDate, spotCashDueDays: settings.spotCashDueDays });
      await tx.scheduleItem.createMany({
        data: schedule.map((s) => ({
          transactionId: t.id,
          seq: s.seq,
          kind: s.kind,
          label: s.label,
          dueDate: s.dueDate,
          amountCents: BigInt(s.amountCents),
          principalCents: s.principalCents != null ? BigInt(s.principalCents) : null,
          interestCents: s.interestCents != null ? BigInt(s.interestCents) : null,
        })),
      });

      // 8) Documentation checklist from the configurable template
      const template = await tx.documentTemplateItem.findMany({ where: { active: true }, orderBy: { order: "asc" } });
      const applicable = template.filter(
        (d) => (!d.financingFilter.length || (r.financing && d.financingFilter.includes(r.financing))) && (!d.schemeFilter.length || d.schemeFilter.includes(q.scheme.kind)) && (!d.marriedOnly || client.civilStatus === "MARRIED"),
      );
      await tx.transactionDocument.createMany({
        data: applicable.map((d, i) => ({ transactionId: t.id, name: d.name, required: d.required, dueDate: addDays(input.reservationDate, d.dueDaysAfterReservation), order: i + 1 })),
      });

      // 9) Reservation fee payment (if collected now)
      if (input.reservationFeePaid && r.reservationFeeCents > 0) {
        await tx.payment.create({
          data: { transactionId: t.id, paidAt: input.reservationDate, amountCents: BigInt(r.reservationFeeCents), orNumber: input.orNumber ?? null, method: (input.paymentMethod as any) ?? "CASH", source: "MANUAL", notes: "Reservation fee", recordedById: ctx.userId },
        });
      }

      // 10) Lead → won stage
      if (lead) {
        const won = await tx.pipelineStage.findFirst({ where: { isWon: true, active: true } });
        if (won && lead.stageId !== won.id) {
          await tx.lead.update({ where: { id: lead.id }, data: { stageId: won.id, stageChangedAt: new Date(), clientId } });
          await tx.leadStageHistory.create({ data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: won.id, changedById: ctx.userId } });
        }
      }

      // 11) Commission ledger, payment allocation, timeline & audit
      await createLedgerForTransaction(tx, t.id, ctx);
      await recalcCollections(tx, t.id, ctx);
      const desc = `${q.items.map((i) => i.code).join(" + ")} reserved — ${code}, TCP ${formatPeso(r.tcpCents)} (${q.scheme.name})`;
      await logActivity({ type: "STATUS_CHANGE", subject: desc, transactionId: t.id, clientId, leadId: lead?.id, brokerId, actorId: ctx.userId }, tx);
      await audit(ctx, { entity: "Transaction", entityId: t.id, action: "create", after: { code, clientId, items: q.items.map((i) => i.code), tcpCents: r.tcpCents, scheme: q.scheme.name, brokerId } }, tx);
      return t;
    },
    { timeout: 30_000, isolationLevel: "ReadCommitted" },
  );

  // Documentation tasks + BNG notification run via the "reservation_created" automation (worker).
  // When events are disabled (tests/seed) run them inline so behaviour is the same.
  if (process.env.DISABLE_EVENTS === "true") await afterReservation(created.id);
  await emit({ type: "transaction.reserved", transactionId: created.id, actorId: ctx.userId });
  return created;
}

/** Reservation follow-ups: documentation tasks for handling staff and a notification to BNG. Idempotent. */
export async function afterReservation(transactionId: string) {
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { client: true, documents: true } });
  for (const d of t.documents.filter((x) => x.required && x.status === "PENDING")) {
    await prisma.task.upsert({
      where: { dedupeKey: `doc:${d.id}` },
      create: { title: `Collect: ${d.name} (${t.code})`, dueAt: d.dueDate, assigneeId: t.handlingStaffId, transactionId: t.id, clientId: t.clientId, priority: "MEDIUM", dedupeKey: `doc:${d.id}` },
      update: {},
    });
  }
  const bng = await usersWithRoleKey(["BNG_STAFF"]);
  await notifyUsers([...bng, t.handlingStaffId], { title: `New reservation ${t.code}`, body: `${fullName(t.client)} — documentation checklist created.`, link: `/transactions/${t.id}`, kind: "TRANSACTION", dedupeKey: `reserved:${t.id}` });
}

/** Re-allocate recorded payments to schedule items (oldest-first) and evaluate commission milestones. */
export async function recalcCollections(tx: Tx, transactionId: string, ctx: ActorCtx) {
  const [items, paid] = await Promise.all([
    tx.scheduleItem.findMany({ where: { transactionId }, orderBy: { seq: "asc" } }),
    tx.payment.aggregate({ where: { transactionId, voidedAt: null }, _sum: { amountCents: true } }),
  ]);
  const alloc = allocatePayments(
    items.map((i) => ({ seq: i.seq, dueDate: i.dueDate, amountCents: Number(i.amountCents) })),
    Number(paid._sum.amountCents ?? 0n),
  );
  for (const i of items) {
    const p = BigInt(alloc.get(i.seq) ?? 0);
    if (p !== i.paidCents) await tx.scheduleItem.update({ where: { id: i.id }, data: { paidCents: p } });
  }
  return evaluateTranches(tx, transactionId, ctx);
}

export async function collectionSummary(transactionId: string, asOf = manilaToday()) {
  const [items, paid] = await Promise.all([
    prisma.scheduleItem.findMany({ where: { transactionId }, orderBy: { seq: "asc" } }),
    prisma.payment.aggregate({ where: { transactionId, voidedAt: null }, _sum: { amountCents: true } }),
  ]);
  return summarizeCollections(
    items.map((i) => ({ seq: i.seq, dueDate: i.dueDate, amountCents: Number(i.amountCents) })),
    Number(paid._sum.amountCents ?? 0n),
    asOf,
  );
}

async function lockTransaction(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${id} FOR UPDATE`;
  const t = await tx.transaction.findUnique({ where: { id }, include: { items: true } });
  if (!t || t.deletedAt) throw new DomainError("Transaction not found.");
  return t;
}

export async function changeTransactionStatus(input: { transactionId: string; toStatus: TxStatus; note?: string | null; effectiveDate?: Date | null }, ctx: ActorCtx) {
  const t = await prisma.$transaction(async (tx) => {
    const t = await lockTransaction(tx, input.transactionId);
    if (input.toStatus === "CANCELLED" || input.toStatus === "TRANSFERRED") throw new DomainError("Use the Cancel or Transfer action.");
    assertTransition(t.status, input.toStatus);
    const when = input.effectiveDate ?? new Date();
    const dateField = STATUS_DATE_FIELD[input.toStatus];
    const updated = await tx.transaction.update({ where: { id: t.id }, data: { status: input.toStatus, statusChangedAt: new Date(), ...(dateField ? { [dateField]: when } : {}) } as Prisma.TransactionUpdateInput });
    // Contract to Sell signed → inventory SOLD
    if (input.toStatus === "CONTRACT_SIGNED") {
      for (const it of t.items.filter((i) => i.active)) {
        const ref: ItemRef = it.unitId ? { kind: "UNIT", id: it.unitId } : { kind: "PARKING", id: it.parkingSlotId! };
        const locked = await lockItem(tx, ref);
        if (locked.status === "RESERVED") await applyInventoryEvent(tx, ref, "MARK_SOLD", ctx, `Contract to Sell signed (${t.code})`, locked);
      }
    }
    await tx.transactionStatusLog.create({ data: { transactionId: t.id, fromStatus: t.status, toStatus: input.toStatus, note: input.note ?? null, actorId: ctx.userId } });
    await logActivity({ type: "STATUS_CHANGE", subject: `${t.code}: ${t.status.replace(/_/g, " ").toLowerCase()} → ${input.toStatus.replace(/_/g, " ").toLowerCase()}`, body: input.note, transactionId: t.id, clientId: t.clientId, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Transaction", entityId: t.id, action: "status_change", before: { status: t.status }, after: { status: input.toStatus, note: input.note } }, tx);
    await evaluateTranches(tx, t.id, ctx);
    return { before: t.status, updated };
  });
  await emit({ type: "transaction.status_changed", transactionId: input.transactionId, from: t.before, to: input.toStatus, actorId: ctx.userId });
  return t.updated;
}

/** Count of monthly installments fully paid (excludes reservation fee and lump sums) for Maceda Law. */
async function installmentMonthsPaid(tx: Tx, transactionId: string) {
  const items = await tx.scheduleItem.findMany({ where: { transactionId, kind: { in: ["DOWNPAYMENT", "DEFERRED", "AMORTIZATION"] } } });
  return items.filter((i) => i.paidCents >= i.amountCents && i.amountCents > 0n).length;
}

export async function macedaPreview(transactionId: string, tx: Tx = prisma): Promise<MacedaResult & { totalPaidCents: number }> {
  const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { paymentScheme: true } });
  const paid = Number((await tx.payment.aggregate({ where: { transactionId, voidedAt: null }, _sum: { amountCents: true } }))._sum.amountCents ?? 0n);
  const kind = (t.schemeSnapshot as any)?.scheme?.kind ?? t.paymentScheme.kind;
  const isInstallment = kind === "DEFERRED_CASH" || (kind === "DP_BALANCE" && !((t.status === "FULLY_PAID" || t.status === "TURNED_OVER") && t.financing !== "IN_HOUSE"));
  const months = await installmentMonthsPaid(tx, transactionId);
  return { ...computeMaceda({ totalPaidCents: paid, installmentMonthsPaid: months, isInstallmentSale: isInstallment }), totalPaidCents: paid };
}

/** Cancel: releases inventory to AVAILABLE, forfeits unreleased commission tranches, snapshots the Maceda computation. */
export async function cancelTransaction(input: { transactionId: string; reason: string }, ctx: ActorCtx) {
  const res = await prisma.$transaction(async (tx) => {
    const t = await lockTransaction(tx, input.transactionId);
    assertTransition(t.status, "CANCELLED");
    const maceda = await macedaPreview(t.id, tx);
    for (const it of t.items.filter((i) => i.active)) {
      const ref: ItemRef = it.unitId ? { kind: "UNIT", id: it.unitId } : { kind: "PARKING", id: it.parkingSlotId! };
      const locked = await lockItem(tx, ref);
      if (locked.status === "RESERVED" || locked.status === "SOLD") await applyInventoryEvent(tx, ref, "CANCEL", ctx, `Cancelled ${t.code}: ${input.reason}`, locked);
      await tx.transactionItem.update({ where: { id: it.id }, data: { active: false } });
    }
    const updated = await tx.transaction.update({
      where: { id: t.id },
      data: { status: "CANCELLED", statusChangedAt: new Date(), cancelledAt: new Date(), cancelReason: input.reason, cancelledById: ctx.userId, macedaSnapshot: maceda as any },
    });
    await forfeitUnreleased(tx, t.id, ctx);
    await tx.task.updateMany({ where: { transactionId: t.id, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
    await tx.transactionStatusLog.create({ data: { transactionId: t.id, fromStatus: t.status, toStatus: "CANCELLED", note: input.reason, actorId: ctx.userId } });
    await logActivity({ type: "STATUS_CHANGE", subject: `${t.code} cancelled`, body: `Reason: ${input.reason}\nIndicative Maceda cash surrender value: ${formatPeso(maceda.cashSurrenderValueCents)} (${maceda.cashSurrenderPct}%)`, transactionId: t.id, clientId: t.clientId, leadId: t.leadId, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Transaction", entityId: t.id, action: "cancel", before: { status: t.status }, after: { status: "CANCELLED", reason: input.reason, maceda } }, tx);
    return { before: t.status, updated };
  });
  await emit({ type: "transaction.status_changed", transactionId: input.transactionId, from: res.before, to: "CANCELLED", actorId: ctx.userId });
  return res.updated;
}

/**
 * Transfer: swap to another unit and/or another buyer. Creates a new transaction carrying over payments
 * (re-pointed) and the payment scheme; the old one becomes TRANSFERRED.
 */
export async function transferTransaction(input: { transactionId: string; newUnitId?: string | null; newClientId?: string | null; reason: string }, ctx: ActorCtx & { userId: string }) {
  if (!input.newUnitId && !input.newClientId) throw new DomainError("Choose a new unit and/or a new buyer.");
  const settings = await getSettings();
  const result = await prisma.$transaction(
    async (tx) => {
      const old = await lockTransaction(tx, input.transactionId);
      assertTransition(old.status, "TRANSFERRED");
      const oldUnitItem = old.items.find((i) => i.active && i.kind === "UNIT");
      const keepItems = old.items.filter((i) => i.active && (i.kind === "PARKING" || !input.newUnitId));
      // Release the old unit when swapping units
      if (input.newUnitId) {
        if (oldUnitItem?.unitId === input.newUnitId) throw new DomainError("Pick a different unit.");
        const newLocked = await lockItem(tx, { kind: "UNIT", id: input.newUnitId });
        if (newLocked.status !== "AVAILABLE") throw new DomainError(`${newLocked.code} is not available.`);
        if (oldUnitItem?.unitId) {
          const l = await lockItem(tx, { kind: "UNIT", id: oldUnitItem.unitId });
          await applyInventoryEvent(tx, { kind: "UNIT", id: oldUnitItem.unitId }, "TRANSFER_OUT", ctx, `Transferred out of ${old.code}`, l);
        }
        await applyInventoryEvent(tx, { kind: "UNIT", id: input.newUnitId }, "RESERVE", ctx, `Transfer from ${old.code}`, newLocked);
      }
      const unitId = input.newUnitId ?? oldUnitItem?.unitId ?? null;
      const slotIds = keepItems.filter((i) => i.kind === "PARKING").map((i) => i.parkingSlotId!);
      const disc = (old.pricingSnapshot as any) ?? {};
      const q = await quote({ unitId, parkingSlotIds: slotIds, paymentSchemeId: old.paymentSchemeId, discountAmountCents: disc.promoDiscountCents ?? 0 }, tx);
      const r = q.result;
      const code = await nextTransactionCode(tx, new Date());
      const nt = await tx.transaction.create({
        data: {
          code,
          clientId: input.newClientId ?? old.clientId,
          leadId: old.leadId,
          developmentId: q.items[0].developmentId,
          brokerId: old.brokerId,
          brokerageId: old.brokerageId,
          handlingStaffId: old.handlingStaffId,
          status: input.newUnitId ? "RESERVED" : old.status,
          paymentSchemeId: old.paymentSchemeId,
          schemeSnapshot: old.schemeSnapshot as any,
          pricingSnapshot: (input.newUnitId ? r : old.pricingSnapshot) as any,
          listPriceCents: input.newUnitId ? BigInt(r.listPriceCents) : old.listPriceCents,
          discountCents: input.newUnitId ? BigInt(r.totalDiscountCents) : old.discountCents,
          netSellingPriceCents: input.newUnitId ? BigInt(r.netSellingPriceCents) : old.netSellingPriceCents,
          vatCents: input.newUnitId ? BigInt(r.vatCents) : old.vatCents,
          miscFeesCents: input.newUnitId ? BigInt(r.miscFeesCents) : old.miscFeesCents,
          tcpCents: input.newUnitId ? BigInt(r.tcpCents) : old.tcpCents,
          reservationFeeCents: old.reservationFeeCents,
          downpaymentCents: input.newUnitId ? BigInt(r.dpGrossCents) : old.downpaymentCents,
          balanceCents: input.newUnitId ? BigInt(r.balanceCents) : old.balanceCents,
          financing: old.financing,
          reservedAt: old.reservedAt,
          contractSignedAt: input.newUnitId ? null : old.contractSignedAt,
          notes: `Transferred from ${old.code}: ${input.reason}`,
          createdById: ctx.userId,
          items: {
            create: [
              ...(unitId ? [{ kind: "UNIT" as const, unitId, listPriceCents: input.newUnitId ? BigInt(q.items.find((i) => i.kind === "UNIT")!.listPriceCents) : oldUnitItem!.listPriceCents }] : []),
              ...keepItems.filter((i) => i.kind === "PARKING").map((i) => ({ kind: "PARKING" as const, parkingSlotId: i.parkingSlotId, listPriceCents: i.listPriceCents, priceListVersion: i.priceListVersion })),
            ],
          },
          statusLogs: { create: { fromStatus: null, toStatus: input.newUnitId ? "RESERVED" : old.status, note: `Transfer from ${old.code}`, actorId: ctx.userId } },
        },
      });
      await tx.transactionItem.updateMany({ where: { transactionId: old.id }, data: { active: false } });
      // Schedule: regenerate for a new unit; copy for a buyer change
      if (input.newUnitId) {
        const lines = generateSchedule(r, q.scheme, { reservationDate: old.reservedAt, spotCashDueDays: settings.spotCashDueDays });
        await tx.scheduleItem.createMany({ data: lines.map((s) => ({ transactionId: nt.id, seq: s.seq, kind: s.kind, label: s.label, dueDate: s.dueDate, amountCents: BigInt(s.amountCents), principalCents: s.principalCents != null ? BigInt(s.principalCents) : null, interestCents: s.interestCents != null ? BigInt(s.interestCents) : null })) });
      } else {
        const lines = await tx.scheduleItem.findMany({ where: { transactionId: old.id } });
        await tx.scheduleItem.createMany({ data: lines.map(({ id: _id, transactionId: _t, ...rest }) => ({ ...rest, transactionId: nt.id })) });
      }
      // Documents carry over
      const docs = await tx.transactionDocument.findMany({ where: { transactionId: old.id } });
      await tx.transactionDocument.createMany({ data: docs.map(({ id: _id, transactionId: _t, createdAt: _c, updatedAt: _u, ...rest }) => ({ ...rest, transactionId: nt.id })) });
      await tx.payment.updateMany({ where: { transactionId: old.id }, data: { transactionId: nt.id, notes: `Carried over from ${old.code}` } });
      await tx.transaction.update({ where: { id: old.id }, data: { status: "TRANSFERRED", statusChangedAt: new Date(), transferredToId: nt.id, cancelReason: input.reason } });
      await tx.transactionStatusLog.create({ data: { transactionId: old.id, fromStatus: old.status, toStatus: "TRANSFERRED", note: `${input.reason} → ${code}`, actorId: ctx.userId } });
      await forfeitUnreleased(tx, old.id, ctx);
      await createLedgerForTransaction(tx, nt.id, ctx);
      await recalcCollections(tx, nt.id, ctx);
      await logActivity({ type: "STATUS_CHANGE", subject: `${old.code} transferred to ${code}`, body: input.reason, transactionId: old.id, clientId: old.clientId, actorId: ctx.userId }, tx);
      await logActivity({ type: "STATUS_CHANGE", subject: `${code} created by transfer from ${old.code}`, body: input.reason, transactionId: nt.id, clientId: nt.clientId, actorId: ctx.userId }, tx);
      await audit(ctx, { entity: "Transaction", entityId: old.id, action: "transfer", before: { status: old.status }, after: { status: "TRANSFERRED", transferredTo: code, newUnitId: input.newUnitId, newClientId: input.newClientId, reason: input.reason } }, tx);
      return nt;
    },
    { timeout: 30_000 },
  );
  return result;
}

// ── Payments ──
export async function recordPayment(
  input: { transactionId: string; paidAt: Date; amountCents: number; orNumber?: string | null; method: string; reference?: string | null; notes?: string | null; source?: "MANUAL" | "CSV" | "NETSUITE"; externalId?: string | null },
  ctx: ActorCtx,
) {
  const res = await prisma.$transaction(async (tx) => {
    const t = await lockTransaction(tx, input.transactionId);
    if (t.status === "CANCELLED" || t.status === "TRANSFERRED") throw new DomainError(`Can't record payments on a ${t.status.toLowerCase()} transaction.`);
    if (input.orNumber) {
      const dup = await tx.payment.findFirst({ where: { orNumber: input.orNumber, voidedAt: null } });
      if (dup) throw new DomainError(`OR number ${input.orNumber} is already recorded.`);
    }
    const p = await tx.payment.create({
      data: {
        transactionId: t.id,
        paidAt: input.paidAt,
        amountCents: BigInt(input.amountCents),
        orNumber: input.orNumber ?? null,
        method: input.method as any,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        source: input.source ?? "MANUAL",
        externalId: input.externalId ?? null,
        recordedById: ctx.userId,
      },
    });
    const dueTranches = await recalcCollections(tx, t.id, ctx);
    await logActivity({ type: "SYSTEM", subject: `Payment received ${formatPeso(input.amountCents)}${input.orNumber ? ` (OR ${input.orNumber})` : ""}`, transactionId: t.id, clientId: t.clientId, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Payment", entityId: p.id, action: "create", after: p }, tx);
    return { payment: p, dueTranches };
  });
  await emit({ type: "payment.recorded", transactionId: input.transactionId, paymentId: res.payment.id, actorId: ctx.userId });
  return res;
}

export async function voidPayment(paymentId: string, reason: string, ctx: ActorCtx) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.voidedAt) throw new DomainError("Payment already voided.");
    await lockTransaction(tx, p.transactionId);
    const after = await tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: reason } });
    await recalcCollections(tx, p.transactionId, ctx);
    await logActivity({ type: "SYSTEM", subject: `Payment voided ${formatPeso(p.amountCents)}${p.orNumber ? ` (OR ${p.orNumber})` : ""}`, body: reason, transactionId: p.transactionId, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Payment", entityId: paymentId, action: "void", before: p, after }, tx);
    return after;
  });
}
