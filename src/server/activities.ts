import type { ActivityType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export interface ActivityInput {
  type: ActivityType;
  subject: string;
  body?: string | null;
  occurredAt?: Date;
  actorId?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  brokerId?: string | null;
  transactionId?: string | null;
  meta?: Prisma.InputJsonValue;
  externalKey?: string | null;
}

/** Add a timeline entry and bump the lead's lastActivityAt (used for stale-lead automation). */
export async function logActivity(a: ActivityInput, tx: Tx = prisma) {
  const act = await tx.activity.create({
    data: {
      type: a.type,
      subject: a.subject.slice(0, 300),
      body: a.body ?? null,
      occurredAt: a.occurredAt ?? new Date(),
      actorId: a.actorId ?? null,
      leadId: a.leadId ?? null,
      clientId: a.clientId ?? null,
      brokerId: a.brokerId ?? null,
      transactionId: a.transactionId ?? null,
      meta: a.meta,
      externalKey: a.externalKey ?? null,
    },
  });
  if (a.leadId && a.type !== "SYSTEM") await tx.lead.update({ where: { id: a.leadId }, data: { lastActivityAt: new Date() } });
  return act;
}

/** Timeline for an entity: includes activities linked to related records (e.g. a client's leads and transactions). */
export async function getTimeline(filter: { leadId?: string; clientId?: string; brokerId?: string; transactionId?: string }, take = 100) {
  const or: Prisma.ActivityWhereInput[] = [];
  if (filter.leadId) or.push({ leadId: filter.leadId });
  if (filter.clientId) {
    or.push({ clientId: filter.clientId });
    const [leads, txs] = await Promise.all([
      prisma.lead.findMany({ where: { clientId: filter.clientId }, select: { id: true } }),
      prisma.transaction.findMany({ where: { clientId: filter.clientId }, select: { id: true } }),
    ]);
    if (leads.length) or.push({ leadId: { in: leads.map((l) => l.id) } });
    if (txs.length) or.push({ transactionId: { in: txs.map((t) => t.id) } });
  }
  if (filter.brokerId) or.push({ brokerId: filter.brokerId });
  if (filter.transactionId) or.push({ transactionId: filter.transactionId });
  if (!or.length) return [];
  return prisma.activity.findMany({ where: { OR: or }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take });
}
