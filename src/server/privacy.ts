import { prisma } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { DomainError } from "@/domain/errors";

/** Data Privacy Act (RA 10173): export everything held about a client (data subject access request). */
export async function exportClientData(clientId: string, ctx: ActorCtx) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      parties: true,
      leads: { include: { stageHistory: true } },
      transactions: { include: { items: true, payments: true, schedule: true, documents: true } },
      activities: true,
      tasks: true,
      computations: true,
    },
  });
  const documents = await prisma.document.findMany({ where: { entityType: "Client", entityId: clientId }, select: { id: true, category: true, fileName: true, createdAt: true, isKyc: true } });
  await audit(ctx, { entity: "Client", entityId: clientId, action: "privacy_export" });
  return { exportedAt: new Date().toISOString(), client, documents };
}

/**
 * Anonymize a client: personal data is replaced, KYC documents are removed, contact details cleared.
 * Financial records (transactions, payments) are kept for accounting/legal retention with no personal identifiers.
 */
export async function anonymizeClient(clientId: string, ctx: ActorCtx) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (c.anonymizedAt) throw new DomainError("Client is already anonymized.");
  const active = await prisma.transaction.count({ where: { clientId, deletedAt: null, status: { notIn: ["CANCELLED", "TRANSFERRED", "TITLED"] } } });
  if (active) throw new DomainError("Client has an active transaction. Anonymize only after it is cancelled, transferred or titled.");
  const tag = `ANON-${clientId.slice(-6).toUpperCase()}`;
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        firstName: "Anonymized",
        middleName: null,
        lastName: tag,
        suffix: null,
        normalizedName: `anonymized ${tag.toLowerCase()}`,
        birthdate: null,
        tin: null,
        addressLine: null,
        city: null,
        province: null,
        zipCode: null,
        employer: null,
        occupation: null,
        monthlyIncomeCents: null,
        email: null,
        mobile: null,
        notes: null,
        doNotEmail: true,
        anonymizedAt: new Date(),
      },
    });
    await tx.clientParty.deleteMany({ where: { clientId } });
    await tx.document.updateMany({ where: { entityType: "Client", entityId: clientId }, data: { deletedAt: new Date() } });
    await tx.lead.updateMany({ where: { clientId }, data: { firstName: "Anonymized", lastName: tag, normalizedName: `anonymized ${tag.toLowerCase()}`, email: null, mobile: null, notes: null, doNotEmail: true } });
    await tx.activity.updateMany({ where: { OR: [{ clientId }, { lead: { clientId } }] }, data: { body: null, meta: undefined } });
    await audit(ctx, { entity: "Client", entityId: clientId, action: "anonymize", before: { name: `${c.firstName} ${c.lastName}` } }, tx);
  });
}
