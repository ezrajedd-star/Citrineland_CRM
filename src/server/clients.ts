import { prisma, type Tx } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { normalizeName } from "@/lib/normalize";
import { logActivity } from "./activities";

/** Create a client from a lead (at reservation or manually), copying contact info and broker of record. */
export async function convertLeadToClient(leadId: string, ctx: ActorCtx, tx: Tx = prisma) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.clientId) return tx.client.findUniqueOrThrow({ where: { id: lead.clientId } });
  const c = await tx.client.create({
    data: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      normalizedName: normalizeName(lead.firstName, lead.lastName),
      email: lead.email,
      mobile: lead.mobile,
      ownerId: lead.ownerId,
      brokerId: lead.brokerId,
      privacyConsent: lead.privacyConsent,
      privacyConsentAt: lead.privacyConsentAt,
      doNotEmail: lead.doNotEmail,
      createdById: ctx.userId,
    },
  });
  await tx.lead.update({ where: { id: leadId }, data: { clientId: c.id } });
  await logActivity({ type: "SYSTEM", subject: "Converted to client", leadId, clientId: c.id, actorId: ctx.userId }, tx);
  await audit(ctx, { entity: "Client", entityId: c.id, action: "create_from_lead", after: { ...c, leadId } }, tx);
  return c;
}
