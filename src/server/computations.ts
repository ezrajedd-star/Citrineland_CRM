import type { PaymentScheme } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { getSettings, type AppSettings } from "@/lib/settings";
import { computeSample, type ComputationResult, type PricedItem, type PricingSettings, type SchemeSnapshot } from "@/domain/pricing/computation";
import { DomainError } from "@/domain/errors";
import { logActivity } from "./activities";

export function toSchemeSnapshot(s: PaymentScheme): SchemeSnapshot {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    reservationFeeCents: Number(s.reservationFeeCents),
    spotDiscountPct: s.spotDiscountPct,
    deferredMonths: s.deferredMonths,
    dpPct: s.dpPct,
    dpMonths: s.dpMonths,
    spotDpDiscountPct: s.spotDpDiscountPct,
    financing: s.financing,
    interestRatePct: s.interestRatePct,
    termMonths: s.termMonths,
  };
}

export function toPricingSettings(s: AppSettings): PricingSettings {
  return { vat: s.vat, miscFees: s.miscFees, financingDefaults: s.financingDefaults };
}

export interface QuoteRequest {
  developmentId?: string | null;
  unitId?: string | null;
  parkingSlotIds?: string[];
  paymentSchemeId: string;
  discountPct?: number | null;
  discountAmountCents?: number | null;
}

/** Load current prices and settings, then run the pure computation. */
export async function quote(req: QuoteRequest, tx: Tx = prisma): Promise<{ result: ComputationResult; scheme: SchemeSnapshot; items: (PricedItem & { id: string; developmentId: string; sectionId: string | null })[]; settings: AppSettings }> {
  const [unit, slots, scheme, settings] = await Promise.all([
    req.unitId ? tx.unit.findFirst({ where: { id: req.unitId, deletedAt: null } }) : null,
    req.parkingSlotIds?.length ? tx.parkingSlot.findMany({ where: { id: { in: req.parkingSlotIds }, deletedAt: null } }) : [],
    tx.paymentScheme.findFirst({ where: { id: req.paymentSchemeId, deletedAt: null } }),
    getSettings(),
  ]);
  if (!scheme) throw new DomainError("Select a payment scheme.");
  if (!unit && !slots.length) throw new DomainError("Select a unit or parking slot.");
  const items = [
    ...(unit ? [{ kind: "UNIT" as const, id: unit.id, code: unit.code, unitType: unit.unitType, listPriceCents: Number(unit.listPriceCents), developmentId: unit.developmentId, sectionId: unit.sectionId }] : []),
    ...slots.map((s) => ({ kind: "PARKING" as const, id: s.id, code: s.code, unitType: null, listPriceCents: Number(s.listPriceCents), developmentId: s.developmentId, sectionId: s.sectionId })),
  ];
  const devIds = new Set(items.map((i) => i.developmentId));
  if (devIds.size > 1) throw new DomainError("All items must be in the same development.");
  if (scheme.developmentId && !devIds.has(scheme.developmentId)) throw new DomainError("This payment scheme isn't offered for this development.");
  const s = toSchemeSnapshot(scheme);
  const result = computeSample({ items, scheme: s, settings: toPricingSettings(settings), discountPct: req.discountPct, discountAmountCents: req.discountAmountCents });
  return { result, scheme: s, items, settings };
}

export async function saveComputation(req: QuoteRequest & { leadId?: string | null; clientId?: string | null }, ctx: ActorCtx) {
  if (!req.leadId && !req.clientId) throw new DomainError("Attach the computation to a lead or client.");
  const { result, scheme, items, settings } = await quote(req);
  const version = (await prisma.sampleComputation.count({ where: req.leadId ? { leadId: req.leadId } : { clientId: req.clientId } })) + 1;
  const validUntil = new Date(Date.now() + settings.computationValidityDays * 86_400_000);
  const c = await prisma.sampleComputation.create({
    data: {
      leadId: req.leadId ?? null,
      clientId: req.clientId ?? null,
      developmentId: items[0].developmentId,
      unitId: items.find((i) => i.kind === "UNIT")?.id ?? null,
      parkingSlotId: items.find((i) => i.kind === "PARKING")?.id ?? null,
      paymentSchemeId: req.paymentSchemeId,
      version,
      inputs: { ...req, scheme, items: items.map((i) => ({ kind: i.kind, id: i.id, code: i.code, listPriceCents: i.listPriceCents })), disclaimer: settings.computationDisclaimer } as any,
      result: result as any,
      tcpCents: BigInt(result.tcpCents),
      validUntil,
      createdById: ctx.userId,
    },
  });
  await logActivity({ type: "SYSTEM", subject: `Sample computation v${version} created (${items.map((i) => i.code).join(" + ")}, ${scheme.name})`, leadId: req.leadId, clientId: req.clientId, actorId: ctx.userId });
  await audit(ctx, { entity: "SampleComputation", entityId: c.id, action: "create", after: { version, tcpCents: result.tcpCents, leadId: req.leadId, clientId: req.clientId } });
  return c;
}
