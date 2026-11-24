import { prisma } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { normalizeName } from "@/lib/normalize";
import { fullName } from "@/lib/utils";
import { DomainError } from "@/domain/errors";
import { logActivity } from "./activities";
import { emit } from "./events";

export interface LeadData {
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  sourceCode: string;
  campaignId?: string | null;
  developmentIds?: string[];
  unitTypePref?: any;
  budgetMinCents?: number | null;
  budgetMaxCents?: number | null;
  financingPref?: any;
  ownerId?: string | null;
  brokerId?: string | null;
  stageId?: string | null;
  privacyConsent?: boolean;
  doNotEmail?: boolean;
  notes?: string | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null; term?: string | null; content?: string | null };
}

export async function defaultStageId() {
  const s = await prisma.pipelineStage.findFirst({ where: { active: true, isWon: false, isLost: false }, orderBy: { order: "asc" } });
  if (!s) throw new DomainError("No pipeline stages configured. Ask an Admin to set them up.");
  return s.id;
}

async function brokerageOf(brokerId: string | null | undefined) {
  if (!brokerId) return null;
  const b = await prisma.broker.findUnique({ where: { id: brokerId }, select: { brokerageId: true } });
  return b?.brokerageId ?? null;
}

export async function createLead(d: LeadData, ctx: ActorCtx) {
  const stageId = d.stageId ?? (await defaultStageId());
  const stage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stageId } });
  if (stage.isWon) throw new DomainError("New leads can't start in a won stage. Create a transaction instead.");
  const lead = await prisma.$transaction(async (tx) => {
    const l = await tx.lead.create({
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        normalizedName: normalizeName(d.firstName, d.lastName),
        email: d.email,
        mobile: d.mobile,
        sourceCode: d.sourceCode,
        campaignId: d.campaignId ?? null,
        developments: d.developmentIds?.length ? { connect: d.developmentIds.map((id) => ({ id })) } : undefined,
        unitTypePref: d.unitTypePref ?? null,
        budgetMinCents: d.budgetMinCents != null ? BigInt(d.budgetMinCents) : null,
        budgetMaxCents: d.budgetMaxCents != null ? BigInt(d.budgetMaxCents) : null,
        financingPref: d.financingPref ?? null,
        ownerId: d.ownerId ?? null,
        brokerId: d.brokerId ?? null,
        brokerageId: await brokerageOf(d.brokerId),
        stageId,
        privacyConsent: d.privacyConsent ?? false,
        privacyConsentAt: d.privacyConsent ? new Date() : null,
        doNotEmail: d.doNotEmail ?? false,
        notes: d.notes ?? null,
        utmSource: d.utm?.source ?? null,
        utmMedium: d.utm?.medium ?? null,
        utmCampaign: d.utm?.campaign ?? null,
        utmTerm: d.utm?.term ?? null,
        utmContent: d.utm?.content ?? null,
        createdById: ctx.userId,
      },
    });
    await tx.leadStageHistory.create({ data: { leadId: l.id, fromStageId: null, toStageId: stageId, changedById: ctx.userId } });
    await logActivity({ type: "SYSTEM", subject: `Lead created (source: ${d.sourceCode.replace(/_/g, " ").toLowerCase()})`, leadId: l.id, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Lead", entityId: l.id, action: "create", after: l }, tx);
    return l;
  });
  await emit({ type: "lead.created", leadId: lead.id, actorId: ctx.userId });
  return lead;
}

export async function updateLead(id: string, d: LeadData, ctx: ActorCtx, opts: { canOverrideBroker: boolean }) {
  const before = await prisma.lead.findUniqueOrThrow({ where: { id }, include: { developments: { select: { id: true } } } });
  if ((d.brokerId ?? null) !== before.brokerId && before.brokerId !== null) {
    if (!opts.canOverrideBroker) throw new DomainError("Changing the broker of record requires the override permission. Use “Override broker”.");
    throw new DomainError("Use “Override broker” to change the broker of record (a reason is required).");
  }
  const after = await prisma.lead.update({
    where: { id },
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      normalizedName: normalizeName(d.firstName, d.lastName),
      email: d.email,
      mobile: d.mobile,
      sourceCode: d.sourceCode,
      campaignId: d.campaignId ?? null,
      developments: { set: (d.developmentIds ?? []).map((x) => ({ id: x })) },
      unitTypePref: d.unitTypePref ?? null,
      budgetMinCents: d.budgetMinCents != null ? BigInt(d.budgetMinCents) : null,
      budgetMaxCents: d.budgetMaxCents != null ? BigInt(d.budgetMaxCents) : null,
      financingPref: d.financingPref ?? null,
      ownerId: d.ownerId ?? null,
      // First assignment of a broker (none before) is allowed without override
      ...(before.brokerId === null && d.brokerId ? { brokerId: d.brokerId, brokerageId: await brokerageOf(d.brokerId) } : {}),
      privacyConsent: d.privacyConsent ?? before.privacyConsent,
      privacyConsentAt: d.privacyConsent && !before.privacyConsent ? new Date() : before.privacyConsentAt,
      doNotEmail: d.doNotEmail ?? before.doNotEmail,
      notes: d.notes ?? null,
    },
  });
  await audit(ctx, { entity: "Lead", entityId: id, action: "update", before, after });
  return after;
}

/** Reassign the broker of record. Citrineland decides attribution; no automatic lead protection. */
export async function overrideBrokerOfRecord(leadId: string, brokerId: string | null, reason: string, ctx: ActorCtx) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: { broker: true } });
    const newBroker = brokerId ? await tx.broker.findUniqueOrThrow({ where: { id: brokerId } }) : null;
    if (lead.brokerId === brokerId) throw new DomainError("That broker is already the broker of record.");
    const after = await tx.lead.update({ where: { id: leadId }, data: { brokerId, brokerageId: newBroker?.brokerageId ?? null } });
    const from = lead.broker ? fullName(lead.broker) : "none";
    const to = newBroker ? fullName(newBroker) : "none";
    await logActivity({ type: "STATUS_CHANGE", subject: `Broker of record changed: ${from} → ${to}`, body: `Reason: ${reason}`, leadId, actorId: ctx.userId, meta: { kind: "broker_override", fromBrokerId: lead.brokerId, toBrokerId: brokerId, reason } }, tx);
    await audit(ctx, { entity: "Lead", entityId: leadId, action: "override_broker", before: { brokerId: lead.brokerId, brokerageId: lead.brokerageId }, after: { brokerId, brokerageId: after.brokerageId, reason } }, tx);
    return after;
  });
}

export async function moveLeadStage(input: { leadId: string; stageId: string; lostReasonCode?: string | null; lostNotes?: string | null; viaTransaction?: boolean }, ctx: ActorCtx) {
  const [lead, stage] = await Promise.all([
    prisma.lead.findUniqueOrThrow({ where: { id: input.leadId }, include: { stage: true } }),
    prisma.pipelineStage.findUniqueOrThrow({ where: { id: input.stageId } }),
  ]);
  if (lead.stageId === stage.id) return lead;
  if (stage.isWon && !input.viaTransaction) throw new DomainError("Moving to a won stage happens by creating the reservation.");
  if (stage.isLost && !input.lostReasonCode) throw new DomainError("Select a lost reason.");
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.lead.update({
      where: { id: lead.id },
      data: { stageId: stage.id, stageChangedAt: new Date(), lostReasonCode: stage.isLost ? input.lostReasonCode : null, lostNotes: stage.isLost ? (input.lostNotes ?? null) : null },
    });
    await tx.leadStageHistory.create({ data: { leadId: lead.id, fromStageId: lead.stageId, toStageId: stage.id, changedById: ctx.userId } });
    await logActivity({ type: "STATUS_CHANGE", subject: `Stage: ${lead.stage.name} → ${stage.name}`, body: stage.isLost ? `Lost reason: ${input.lostReasonCode}${input.lostNotes ? ` — ${input.lostNotes}` : ""}` : null, leadId: lead.id, actorId: ctx.userId }, tx);
    await audit(ctx, { entity: "Lead", entityId: lead.id, action: "stage_change", before: { stageId: lead.stageId }, after: { stageId: stage.id, lostReasonCode: input.lostReasonCode } }, tx);
    return u;
  });
  await emit({ type: "lead.stage_changed", leadId: lead.id, fromStageId: lead.stageId, toStageId: stage.id, actorId: ctx.userId });
  return updated;
}

/** Leads a user may see. */
export function leadScope(user: { id: string; permissions: ReadonlySet<string> }) {
  return user.permissions.has("*") || user.permissions.has("leads:view_all") ? {} : { ownerId: user.id };
}
