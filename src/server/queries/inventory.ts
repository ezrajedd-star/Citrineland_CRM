import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";

export interface InventoryFilters {
  developmentId?: string;
  sectionId?: string;
  kind?: "UNIT" | "PARKING";
  status?: string;
  unitType?: string;
  q?: string;
}

export interface ItemVM {
  kind: "UNIT" | "PARKING";
  id: string;
  code: string;
  developmentId: string;
  developmentName: string;
  sectionId: string | null;
  sectionName: string | null;
  sectionKind: string | null;
  floor: number | null;
  block: string | null;
  lot: string | null;
  level: string | null;
  type: string;
  model: string | null;
  floorArea: string | null;
  lotArea: string | null;
  bedrooms: number | null;
  status: string;
  priceCents: number;
  daysAvailable: number | null;
  hold: { id: string; placedById: string; placedBy: string; expiresAt: string; party: string | null; broker: string | null } | null;
  transaction: { id: string; code: string; client: string; broker: string | null; status: string } | null;
}

export async function getInventoryItems(f: InventoryFilters, opts: { take?: number; skip?: number } = {}): Promise<{ items: ItemVM[]; total: number }> {
  const q = f.q?.trim();
  const unitWhere: Prisma.UnitWhereInput = {
    deletedAt: null,
    development: { deletedAt: null },
    ...(f.developmentId ? { developmentId: f.developmentId } : {}),
    ...(f.sectionId ? { sectionId: f.sectionId } : {}),
    ...(f.status ? { status: f.status as any } : {}),
    ...(f.unitType ? { unitType: f.unitType as any } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const slotWhere: Prisma.ParkingSlotWhereInput = {
    deletedAt: null,
    development: { deletedAt: null },
    ...(f.developmentId ? { developmentId: f.developmentId } : {}),
    ...(f.sectionId ? { sectionId: f.sectionId } : {}),
    ...(f.status ? { status: f.status as any } : {}),
    ...(q ? { code: { contains: q, mode: "insensitive" } } : {}),
  };
  const holdInclude = {
    where: { status: "ACTIVE" as const },
    include: { placedBy: { select: { name: true } }, lead: { select: { firstName: true, lastName: true } }, client: { select: { firstName: true, lastName: true } }, broker: { select: { firstName: true, lastName: true } } },
    take: 1,
  };
  const txInclude = {
    where: { active: true, transaction: { status: { notIn: ["CANCELLED", "TRANSFERRED"] as any } } },
    include: { transaction: { select: { id: true, code: true, status: true, client: { select: { firstName: true, lastName: true } }, broker: { select: { firstName: true, lastName: true } } } } },
    take: 1,
  };
  const wantUnits = f.kind !== "PARKING";
  const wantSlots = f.kind !== "UNIT" && !f.unitType;
  const [units, unitTotal, slots, slotTotal] = await Promise.all([
    wantUnits
      ? prisma.unit.findMany({ where: unitWhere, include: { development: { select: { name: true } }, section: true, holds: holdInclude, transactionItems: txInclude }, orderBy: [{ developmentId: "asc" }, { code: "asc" }], take: opts.take, skip: opts.skip })
      : [],
    wantUnits ? prisma.unit.count({ where: unitWhere }) : 0,
    wantSlots
      ? prisma.parkingSlot.findMany({ where: slotWhere, include: { development: { select: { name: true } }, section: true, holds: holdInclude, transactionItems: txInclude }, orderBy: [{ developmentId: "asc" }, { code: "asc" }], take: opts.take, skip: opts.skip })
      : [],
    wantSlots ? prisma.parkingSlot.count({ where: slotWhere }) : 0,
  ]);
  const now = Date.now();
  const vm = (x: any, kind: "UNIT" | "PARKING"): ItemVM => {
    const h = x.holds[0];
    const t = x.transactionItems[0]?.transaction;
    return {
      kind,
      id: x.id,
      code: x.code,
      developmentId: x.developmentId,
      developmentName: x.development.name,
      sectionId: x.sectionId,
      sectionName: x.section?.name ?? null,
      sectionKind: x.section?.kind ?? null,
      floor: x.floor ?? null,
      block: x.block ?? null,
      lot: x.lot ?? null,
      level: x.level ?? null,
      type: kind === "UNIT" ? x.unitType : x.type,
      model: x.model ?? null,
      floorArea: x.floorArea?.toString() ?? null,
      lotArea: x.lotArea?.toString() ?? null,
      bedrooms: x.bedrooms ?? null,
      status: x.status,
      priceCents: Number(x.listPriceCents),
      daysAvailable: x.status === "AVAILABLE" && x.availableSince ? Math.floor((now - x.availableSince.getTime()) / 86_400_000) : null,
      hold: h
        ? {
            id: h.id,
            placedById: h.placedById,
            placedBy: h.placedBy.name,
            expiresAt: h.expiresAt.toISOString(),
            party: h.lead ? fullName(h.lead) : h.client ? fullName(h.client) : null,
            broker: h.broker ? fullName(h.broker) : null,
          }
        : null,
      transaction: t ? { id: t.id, code: t.code, client: fullName(t.client), broker: t.broker ? fullName(t.broker) : null, status: t.status } : null,
    };
  };
  return { items: [...units.map((u) => vm(u, "UNIT")), ...slots.map((s) => vm(s, "PARKING"))], total: unitTotal + slotTotal };
}
