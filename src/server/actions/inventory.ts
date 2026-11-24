"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac/can";
import { DomainError } from "@/domain/errors";
import { developmentSchema, sectionSchema, unitSchema, parkingSchema, paymentSchemeSchema, holdSchema, blockSchema, priceChangeSchema } from "@/lib/validation/schemas";
import { placeHold, releaseHold } from "@/server/holds";
import { blockItem } from "@/server/inventory";
import { createPriceListVersion } from "@/server/price-lists";
import { manilaToday } from "@/lib/format";
import { pctOf } from "@/lib/money";

// ── Developments ──
export const saveDevelopment = action(["developments:create", "developments:update"], developmentSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    if (!can(ctx.user, "developments:update")) throw new DomainError("You can't edit developments.");
    const before = await prisma.development.findUniqueOrThrow({ where: { id } });
    const after = await prisma.development.update({ where: { id }, data });
    await audit(ctx, { entity: "Development", entityId: id, action: "update", before, after });
    revalidatePath(`/developments/${id}`);
    return { ok: true as const, message: "Development saved" };
  }
  if (!can(ctx.user, "developments:create")) throw new DomainError("You can't create developments.");
  const d = await prisma.development.create({ data: { ...data, createdById: ctx.userId } });
  await audit(ctx, { entity: "Development", entityId: d.id, action: "create", after: d });
  return { ok: true as const, message: "Development created", redirect: `/developments/${d.id}` };
});

export const deleteDevelopment = action("developments:delete", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const tx = await prisma.transaction.count({ where: { developmentId: id, deletedAt: null } });
  if (tx > 0) throw new DomainError("This development has transactions and can't be deleted.");
  const before = await prisma.development.findUniqueOrThrow({ where: { id } });
  await prisma.development.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "Development", entityId: id, action: "delete", before });
  return { ok: true as const, message: "Development deleted", redirect: "/developments" };
});

export const saveSection = action("developments:update", sectionSchema, async (input, ctx) => {
  const { id, ...data } = input;
  if (id) {
    const before = await prisma.section.findUniqueOrThrow({ where: { id } });
    const after = await prisma.section.update({ where: { id }, data });
    await audit(ctx, { entity: "Section", entityId: id, action: "update", before, after });
  } else {
    const s = await prisma.section.create({ data: { ...data, createdById: ctx.userId } });
    await audit(ctx, { entity: "Section", entityId: s.id, action: "create", after: s });
  }
  revalidatePath(`/developments/${input.developmentId}`);
  return { ok: true as const, message: "Section saved" };
});

export const deleteSection = action("developments:update", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const s = await prisma.section.findUniqueOrThrow({ where: { id }, include: { _count: { select: { units: { where: { deletedAt: null } }, parkingSlots: { where: { deletedAt: null } } } } } });
  if (s._count.units + s._count.parkingSlots > 0) throw new DomainError("Move or delete the units/slots in this section first.");
  await prisma.section.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: "Section", entityId: id, action: "delete", before: s });
  revalidatePath(`/developments/${s.developmentId}`);
  return { ok: true as const, message: "Section deleted" };
});

// ── Units & parking ──
export const saveUnit = action(["units:create", "units:update"], unitSchema, async (input, ctx) => {
  const { id, listPrice, floorArea, lotArea, ...rest } = input;
  const data = { ...rest, floorArea: floorArea ?? null, lotArea: lotArea ?? null };
  if (id) {
    if (!can(ctx.user, "units:update")) throw new DomainError("You can't edit units.");
    const before = await prisma.unit.findUniqueOrThrow({ where: { id } });
    const after = await prisma.unit.update({ where: { id }, data });
    await audit(ctx, { entity: "Unit", entityId: id, action: "update", before, after });
  } else {
    if (!can(ctx.user, "units:create")) throw new DomainError("You can't create units.");
    if (listPrice === null || listPrice === undefined) throw new DomainError("Enter the initial list price.");
    const u = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({ data: { ...data, listPriceCents: 0n, createdById: ctx.userId } });
      await createPriceListVersion({ developmentId: input.developmentId, effectiveDate: manilaToday(), notes: `Initial price for ${unit.code}`, items: [{ kind: "UNIT", id: unit.id, priceCents: listPrice }] }, ctx, tx);
      await audit(ctx, { entity: "Unit", entityId: unit.id, action: "create", after: { ...unit, listPriceCents: listPrice } }, tx);
      return unit;
    });
    revalidatePath(`/developments/${u.developmentId}`);
  }
  revalidatePath("/inventory");
  return { ok: true as const, message: "Unit saved" };
});

export const saveParking = action(["units:create", "units:update"], parkingSchema, async (input, ctx) => {
  const { id, listPrice, ...data } = input;
  if (id) {
    if (!can(ctx.user, "units:update")) throw new DomainError("You can't edit parking slots.");
    const before = await prisma.parkingSlot.findUniqueOrThrow({ where: { id } });
    const after = await prisma.parkingSlot.update({ where: { id }, data });
    await audit(ctx, { entity: "ParkingSlot", entityId: id, action: "update", before, after });
  } else {
    if (!can(ctx.user, "units:create")) throw new DomainError("You can't create parking slots.");
    if (listPrice === null || listPrice === undefined) throw new DomainError("Enter the initial list price.");
    await prisma.$transaction(async (tx) => {
      const p = await tx.parkingSlot.create({ data: { ...data, listPriceCents: 0n, createdById: ctx.userId } });
      await createPriceListVersion({ developmentId: input.developmentId, effectiveDate: manilaToday(), notes: `Initial price for ${p.code}`, items: [{ kind: "PARKING", id: p.id, priceCents: listPrice }] }, ctx, tx);
      await audit(ctx, { entity: "ParkingSlot", entityId: p.id, action: "create", after: p }, tx);
    });
  }
  revalidatePath("/inventory");
  revalidatePath(`/developments/${input.developmentId}`);
  return { ok: true as const, message: "Parking slot saved" };
});

export const deleteInventoryItem = action("units:delete", z.object({ kind: z.enum(["UNIT", "PARKING"]), id: z.string() }), async ({ kind, id }, ctx) => {
  const item = kind === "UNIT" ? await prisma.unit.findUniqueOrThrow({ where: { id } }) : await prisma.parkingSlot.findUniqueOrThrow({ where: { id } });
  if (item.status !== "AVAILABLE" && item.status !== "BLOCKED") throw new DomainError("Only available or blocked items can be deleted.");
  const used = await prisma.transactionItem.count({ where: kind === "UNIT" ? { unitId: id } : { parkingSlotId: id } });
  if (used) throw new DomainError("This item has transaction history and can't be deleted. Block it instead.");
  if (kind === "UNIT") await prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
  else await prisma.parkingSlot.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, { entity: kind === "UNIT" ? "Unit" : "ParkingSlot", entityId: id, action: "delete", before: item });
  revalidatePath("/inventory");
  return { ok: true as const, message: "Deleted" };
});

// ── Holds & blocking ──
export const placeHoldAction = action("holds:create", holdSchema, async (input, ctx) => {
  if (!input.unitId && !input.parkingSlotId) throw new DomainError("Select a unit or parking slot.");
  const hold = await placeHold(
    { ref: input.unitId ? { kind: "UNIT", id: input.unitId } : { kind: "PARKING", id: input.parkingSlotId! }, leadId: input.leadId, clientId: input.clientId, brokerId: input.brokerId, hours: input.hours, notes: input.notes },
    ctx,
  );
  revalidatePath("/inventory");
  return { ok: true as const, message: "Hold placed", data: { holdId: hold.id } };
});

export const releaseHoldAction = action(null, z.object({ holdId: z.string(), reason: z.string().optional() }), async ({ holdId, reason }, ctx) => {
  await releaseHold(holdId, ctx, { reason, canReleaseOthers: can(ctx.user, "holds:release") });
  revalidatePath("/inventory");
  return { ok: true as const, message: "Hold released" };
});

export const blockAction = action("units:block", blockSchema, async (input, ctx) => {
  await blockItem({ kind: input.kind, id: input.id }, input.block, input.reason, ctx);
  revalidatePath("/inventory");
  return { ok: true as const, message: input.block ? "Blocked" : "Unblocked" };
});

// ── Price lists ──
export const savePriceChange = action("price_lists:update", priceChangeSchema, async (input, ctx) => {
  let items = input.items.map((i) => ({ kind: i.kind, id: i.id, priceCents: i.price }));
  if (input.itemKind && input.itemId && input.price !== null && input.price !== undefined) items.push({ kind: input.itemKind, id: input.itemId, priceCents: input.price });
  if (input.adjustPct !== null && input.adjustPct !== undefined && input.adjustPct !== 0) {
    // Adjust every available item in the development by a percentage
    const [units, slots] = await Promise.all([
      prisma.unit.findMany({ where: { developmentId: input.developmentId, deletedAt: null, status: { in: ["AVAILABLE", "ON_HOLD", "BLOCKED"] } } }),
      prisma.parkingSlot.findMany({ where: { developmentId: input.developmentId, deletedAt: null, status: { in: ["AVAILABLE", "ON_HOLD", "BLOCKED"] } } }),
    ]);
    const pct = input.adjustPct;
    const round = (c: number) => Math.round(c / 100_000) * 100_000; // nearest ₱1,000
    items = [
      ...units.map((u) => ({ kind: "UNIT" as const, id: u.id, priceCents: round(Number(u.listPriceCents) + pctOf(Number(u.listPriceCents), pct)) })),
      ...slots.map((s) => ({ kind: "PARKING" as const, id: s.id, priceCents: round(Number(s.listPriceCents) + pctOf(Number(s.listPriceCents), pct)) })),
    ];
  }
  const pl = await createPriceListVersion({ developmentId: input.developmentId, effectiveDate: input.effectiveDate, notes: input.notes, items }, ctx);
  revalidatePath(`/developments/${input.developmentId}`);
  revalidatePath("/inventory");
  return { ok: true as const, message: `Price list v${pl.version} saved (${items.length} items)` };
});

// ── Payment schemes ──
export const savePaymentScheme = action("payment_schemes:manage", paymentSchemeSchema, async (input, ctx) => {
  const { id, reservationFee, ...rest } = input;
  const data = { ...rest, reservationFeeCents: BigInt(reservationFee) } as any;
  if (rest.kind !== "DP_BALANCE") Object.assign(data, { dpPct: null, dpMonths: null, financing: null, spotDpDiscountPct: 0 });
  if (rest.kind !== "DEFERRED_CASH") data.deferredMonths = null;
  if (rest.kind !== "SPOT_CASH") data.spotDiscountPct = 0;
  if (rest.financing !== "IN_HOUSE" && rest.kind === "DP_BALANCE") {
    // bank/Pag-IBIG rates are indicative only, kept for computations
  }
  if (id) {
    const before = await prisma.paymentScheme.findUniqueOrThrow({ where: { id } });
    const after = await prisma.paymentScheme.update({ where: { id }, data });
    await audit(ctx, { entity: "PaymentScheme", entityId: id, action: "update", before, after });
  } else {
    const s = await prisma.paymentScheme.create({ data: { ...data, createdById: ctx.userId } });
    await audit(ctx, { entity: "PaymentScheme", entityId: s.id, action: "create", after: s });
  }
  revalidatePath("/admin/payment-schemes");
  if (input.developmentId) revalidatePath(`/developments/${input.developmentId}`);
  return { ok: true as const, message: "Payment scheme saved" };
});

export const deletePaymentScheme = action("payment_schemes:manage", z.object({ id: z.string() }), async ({ id }, ctx) => {
  const before = await prisma.paymentScheme.findUniqueOrThrow({ where: { id } });
  await prisma.paymentScheme.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit(ctx, { entity: "PaymentScheme", entityId: id, action: "delete", before });
  revalidatePath("/admin/payment-schemes");
  return { ok: true as const, message: "Payment scheme removed" };
});
