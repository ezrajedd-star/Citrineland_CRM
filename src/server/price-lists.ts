import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { manilaToday } from "@/lib/format";
import { DomainError } from "@/domain/errors";

export interface PriceChangeItem {
  kind: "UNIT" | "PARKING";
  id: string;
  priceCents: number;
}

/**
 * Create a new price list version. Prices never change in place: each change is a new version with an effective
 * date. Versions effective today or earlier are applied immediately; future versions are applied by the worker.
 */
export async function createPriceListVersion(
  input: { developmentId: string; effectiveDate: Date; notes?: string | null; items: PriceChangeItem[] },
  ctx: ActorCtx,
  tx?: Tx,
) {
  if (!input.items.length) throw new DomainError("No price changes to save.");
  const run = async (t: Tx) => {
    // Serialize version numbering per development
    await t.$queryRaw`SELECT id FROM "Development" WHERE id = ${input.developmentId} FOR UPDATE`;
    const last = await t.priceList.findFirst({ where: { developmentId: input.developmentId }, orderBy: { version: "desc" } });
    const unitIds = input.items.filter((i) => i.kind === "UNIT").map((i) => i.id);
    const slotIds = input.items.filter((i) => i.kind === "PARKING").map((i) => i.id);
    const [units, slots] = await Promise.all([
      t.unit.findMany({ where: { id: { in: unitIds }, developmentId: input.developmentId }, select: { id: true, listPriceCents: true } }),
      t.parkingSlot.findMany({ where: { id: { in: slotIds }, developmentId: input.developmentId }, select: { id: true, listPriceCents: true } }),
    ]);
    const prev = new Map<string, bigint>([...units, ...slots].map((x) => [x.id, x.listPriceCents]));
    if (prev.size !== input.items.length) throw new DomainError("Some items don't belong to this development.");
    const pl = await t.priceList.create({
      data: {
        developmentId: input.developmentId,
        version: (last?.version ?? 0) + 1,
        effectiveDate: input.effectiveDate,
        notes: input.notes ?? null,
        createdById: ctx.userId,
        items: {
          create: input.items.map((i) => ({
            unitId: i.kind === "UNIT" ? i.id : null,
            parkingSlotId: i.kind === "PARKING" ? i.id : null,
            priceCents: BigInt(i.priceCents),
            previousPriceCents: prev.get(i.id) ?? null,
          })),
        },
      },
    });
    await audit(ctx, { entity: "PriceList", entityId: pl.id, action: "create_version", after: { version: pl.version, effectiveDate: pl.effectiveDate, items: input.items.length } }, t);
    if (input.effectiveDate.getTime() <= manilaToday().getTime()) await applyPriceList(t, pl.id, ctx);
    return pl;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function applyPriceList(tx: Tx, priceListId: string, ctx: ActorCtx) {
  const pl = await tx.priceList.findUniqueOrThrow({ where: { id: priceListId }, include: { items: true } });
  if (pl.appliedAt) return 0;
  for (const it of pl.items) {
    if (it.unitId) await tx.unit.update({ where: { id: it.unitId }, data: { listPriceCents: it.priceCents } });
    if (it.parkingSlotId) await tx.parkingSlot.update({ where: { id: it.parkingSlotId }, data: { listPriceCents: it.priceCents } });
  }
  await tx.priceList.update({ where: { id: pl.id }, data: { appliedAt: new Date() } });
  await audit(ctx, { entity: "PriceList", entityId: pl.id, action: "apply", after: { version: pl.version, items: pl.items.length } }, tx);
  return pl.items.length;
}

/** Worker: apply future-dated price lists that have become effective. */
export async function applyDuePriceLists(ctx: ActorCtx) {
  const due = await prisma.priceList.findMany({ where: { appliedAt: null, effectiveDate: { lte: manilaToday() } }, orderBy: [{ developmentId: "asc" }, { version: "asc" }] });
  for (const pl of due) await prisma.$transaction((tx) => applyPriceList(tx, pl.id, ctx));
  return due.length;
}

/** Price list version number currently in effect for a development (for transaction snapshots). */
export async function currentPriceListVersion(developmentId: string, tx: Tx = prisma): Promise<number | null> {
  const pl = await tx.priceList.findFirst({ where: { developmentId, appliedAt: { not: null } }, orderBy: { version: "desc" }, select: { version: true } });
  return pl?.version ?? null;
}
