import { prisma } from "@/lib/db";
import { normalizeName } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export interface DuplicateMatch {
  kind: "lead" | "client";
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  matchedOn: ("email" | "mobile" | "name")[];
  brokerOfRecord: string | null;
  owner: string | null;
  stage?: string | null;
}

/**
 * Find existing leads/clients matching by email, mobile (E.164), or normalized name
 * (exact or trigram similarity ≥ 0.55). Used to warn before creating a duplicate.
 */
export async function findDuplicates(input: { firstName: string; lastName: string; email?: string | null; mobile?: string | null; excludeLeadId?: string | null; excludeClientId?: string | null }): Promise<DuplicateMatch[]> {
  const name = normalizeName(input.firstName, input.lastName);
  const ors: any[] = [{ normalizedName: name }];
  if (input.email) ors.push({ email: { equals: input.email, mode: "insensitive" } });
  if (input.mobile) ors.push({ mobile: input.mobile });
  const similar = await prisma.$queryRaw<{ id: string; kind: string }[]>`
    SELECT id, 'lead' AS kind FROM "Lead" WHERE "deletedAt" IS NULL AND similarity("normalizedName", ${name}) >= 0.55
    UNION ALL
    SELECT id, 'client' AS kind FROM "Client" WHERE "deletedAt" IS NULL AND similarity("normalizedName", ${name}) >= 0.55
    LIMIT 20`;
  const simLeadIds = similar.filter((s) => s.kind === "lead").map((s) => s.id);
  const simClientIds = similar.filter((s) => s.kind === "client").map((s) => s.id);
  const [leads, clients] = await Promise.all([
    prisma.lead.findMany({
      where: { deletedAt: null, id: input.excludeLeadId ? { not: input.excludeLeadId } : undefined, OR: [...ors, { id: { in: simLeadIds } }] },
      include: { broker: true, owner: { select: { name: true } }, stage: { select: { name: true } } },
      take: 10,
    }),
    prisma.client.findMany({
      where: { deletedAt: null, anonymizedAt: null, id: input.excludeClientId ? { not: input.excludeClientId } : undefined, OR: [...ors, { id: { in: simClientIds } }] },
      include: { broker: true, owner: { select: { name: true } } },
      take: 10,
    }),
  ]);
  const on = (r: { email: string | null; mobile: string | null; normalizedName: string }) => {
    const m: DuplicateMatch["matchedOn"] = [];
    if (input.email && r.email?.toLowerCase() === input.email.toLowerCase()) m.push("email");
    if (input.mobile && r.mobile === input.mobile) m.push("mobile");
    if (r.normalizedName === name || m.length === 0) m.push("name");
    return m;
  };
  return [
    ...leads.map((l) => ({ kind: "lead" as const, id: l.id, name: fullName(l), email: l.email, mobile: l.mobile, matchedOn: on(l), brokerOfRecord: l.broker ? fullName(l.broker) : null, owner: l.owner?.name ?? null, stage: l.stage.name })),
    ...clients.map((c) => ({ kind: "client" as const, id: c.id, name: fullName(c), email: c.email, mobile: c.mobile, matchedOn: on(c), brokerOfRecord: c.broker ? fullName(c.broker) : null, owner: c.owner?.name ?? null })),
  ];
}

export function duplicateMessage(matches: DuplicateMatch[]): string {
  const list = matches
    .slice(0, 3)
    .map((m) => `${m.name} (${m.kind}${m.stage ? `, ${m.stage}` : ""}; matched on ${m.matchedOn.join("/")}; broker of record: ${m.brokerOfRecord ?? "none"}${m.owner ? `; owner: ${m.owner}` : ""})`)
    .join("; ");
  return `Possible duplicate: ${list}${matches.length > 3 ? ` and ${matches.length - 3} more` : ""}.`;
}
