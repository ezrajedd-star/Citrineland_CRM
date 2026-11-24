import type { InventoryStatus as DbInventoryStatus } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { nextInventoryStatus, type InventoryEvent } from "@/domain/inventory/state-machine";
import { DomainError } from "@/domain/errors";

export type ItemKind = "UNIT" | "PARKING";
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

export interface LockedItem {
  id: string;
  kind: ItemKind;
  code: string;
  status: DbInventoryStatus;
  developmentId: string;
  sectionId: string | null;
  listPriceCents: bigint;
  unitType: string | null;
}

/**
 * Lock a unit/parking row with SELECT … FOR UPDATE. Must run inside prisma.$transaction.
 * Concurrent reservations of the same item serialize here; the loser sees the new status and fails.
 */
export async function lockItem(tx: Tx, ref: ItemRef): Promise<LockedItem> {
  const rows =
    ref.kind === "UNIT"
      ? await tx.$queryRaw<any[]>`SELECT id, code, status, "developmentId", "sectionId", "listPriceCents", "unitType"::text AS "unitType" FROM "Unit" WHERE id = ${ref.id} AND "deletedAt" IS NULL FOR UPDATE`
      : await tx.$queryRaw<any[]>`SELECT id, code, status, "developmentId", "sectionId", "listPriceCents", NULL AS "unitType" FROM "ParkingSlot" WHERE id = ${ref.id} AND "deletedAt" IS NULL FOR UPDATE`;
  const r = rows[0];
  if (!r) throw new DomainError(`${ref.kind === "UNIT" ? "Unit" : "Parking slot"} not found.`);
  return { ...r, kind: ref.kind, listPriceCents: BigInt(r.listPriceCents) };
}

/**
 * The ONLY place inventory status changes. Validates via the state machine, logs the change and audits it.
 */
export async function applyInventoryEvent(tx: Tx, ref: ItemRef, event: InventoryEvent, ctx: ActorCtx, reason?: string | null, locked?: LockedItem) {
  const item = locked ?? (await lockItem(tx, ref));
  const from = item.status;
  const to = nextInventoryStatus(from, event) as DbInventoryStatus;
  const now = new Date();
  const data = { status: to, statusChangedAt: now, ...(to === "AVAILABLE" ? { availableSince: now } : {}) };
  if (ref.kind === "UNIT") await tx.unit.update({ where: { id: ref.id }, data });
  else await tx.parkingSlot.update({ where: { id: ref.id }, data });
  await tx.inventoryStatusLog.create({
    data: {
      unitId: ref.kind === "UNIT" ? ref.id : null,
      parkingSlotId: ref.kind === "PARKING" ? ref.id : null,
      fromStatus: from,
      toStatus: to,
      event,
      reason: reason ?? null,
      actorId: ctx.userId,
    },
  });
  await audit(ctx, { entity: ref.kind === "UNIT" ? "Unit" : "ParkingSlot", entityId: ref.id, action: `status:${event.toLowerCase()}`, before: { status: from }, after: { status: to, reason } }, tx);
  return { from, to, item: { ...item, status: to } };
}

export async function blockItem(ref: ItemRef, block: boolean, reason: string, ctx: ActorCtx) {
  return prisma.$transaction((tx) => applyInventoryEvent(tx, ref, block ? "BLOCK" : "UNBLOCK", ctx, reason));
}
