import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { normalizeName, normalizePhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";
import { leadScope } from "@/server/leads";

export interface SearchHit {
  kind: "Lead" | "Client" | "Broker" | "Brokerage" | "Unit" | "Parking" | "Transaction";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Global search by name (trigram fuzzy), code, email or phone. Results respect permissions. */
export async function globalSearch(user: CurrentUser, raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const name = normalizeName(q);
  const digits = q.replace(/\D/g, "");
  const phone = normalizePhMobile(q) ?? (digits.length >= 7 ? digits.slice(-10) : null);
  const hits: SearchHit[] = [];
  const fuzzy = async (table: "Lead" | "Client") =>
    (await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${table}" WHERE "deletedAt" IS NULL AND ("normalizedName" % $1 OR "normalizedName" LIKE $2) ORDER BY similarity("normalizedName", $1) DESC LIMIT 15`, name, `%${name}%`)).map((r) => r.id);

  if (can(user, "leads:view")) {
    const ids = await fuzzy("Lead");
    const leads = await prisma.lead.findMany({
      where: { deletedAt: null, ...leadScope(user), OR: [{ id: { in: ids } }, { email: { contains: q, mode: "insensitive" } }, ...(phone ? [{ mobile: { contains: phone } }] : [])] },
      include: { stage: { select: { name: true } } },
      take: 15,
    });
    hits.push(...leads.map((l) => ({ kind: "Lead" as const, id: l.id, title: fullName(l), subtitle: [l.stage.name, l.mobile, l.email].filter(Boolean).join(" · "), href: `/pipeline/leads/${l.id}` })));
  }
  if (can(user, "clients:view")) {
    const ids = await fuzzy("Client");
    const clients = await prisma.client.findMany({ where: { deletedAt: null, OR: [{ id: { in: ids } }, { email: { contains: q, mode: "insensitive" } }, ...(phone ? [{ mobile: { contains: phone } }] : []), { tin: { contains: q } }] }, take: 15 });
    hits.push(...clients.map((c) => ({ kind: "Client" as const, id: c.id, title: fullName(c), subtitle: [c.mobile, c.email].filter(Boolean).join(" · "), href: `/clients/${c.id}` })));
  }
  if (can(user, "brokers:view")) {
    const brokers = await prisma.broker.findMany({
      where: {
        deletedAt: null,
        OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { prcLicenseNo: { contains: q } }, ...(phone ? [{ mobile: { contains: phone } }] : [])],
      },
      include: { brokerage: { select: { name: true } } },
      take: 10,
    });
    hits.push(...brokers.map((b) => ({ kind: "Broker" as const, id: b.id, title: fullName(b), subtitle: b.brokerage?.name ?? "Independent", href: `/brokers/${b.id}` })));
    const firms = await prisma.brokerage.findMany({ where: { deletedAt: null, name: { contains: q, mode: "insensitive" } }, take: 5 });
    hits.push(...firms.map((b) => ({ kind: "Brokerage" as const, id: b.id, title: b.name, subtitle: b.city ?? "", href: `/brokers/brokerages/${b.id}` })));
  }
  if (can(user, "units:view")) {
    const units = await prisma.unit.findMany({ where: { deletedAt: null, code: { contains: q, mode: "insensitive" } }, include: { development: { select: { name: true } } }, take: 10 });
    hits.push(...units.map((u) => ({ kind: "Unit" as const, id: u.id, title: u.code, subtitle: `${u.development.name} · ${u.status.toLowerCase().replace("_", " ")}`, href: `/inventory/units/${u.id}` })));
    const slots = await prisma.parkingSlot.findMany({ where: { deletedAt: null, code: { contains: q, mode: "insensitive" } }, include: { development: { select: { name: true } } }, take: 5 });
    hits.push(...slots.map((u) => ({ kind: "Parking" as const, id: u.id, title: u.code, subtitle: `${u.development.name} · ${u.status.toLowerCase().replace("_", " ")}`, href: `/inventory/parking/${u.id}` })));
  }
  if (can(user, "transactions:view")) {
    const txs = await prisma.transaction.findMany({ where: { deletedAt: null, OR: [{ code: { contains: q, mode: "insensitive" } }, { client: { normalizedName: { contains: name } } }] }, include: { client: true }, take: 10 });
    hits.push(...txs.map((t) => ({ kind: "Transaction" as const, id: t.id, title: t.code, subtitle: `${fullName(t.client)} · ${t.status.toLowerCase().replace(/_/g, " ")}`, href: `/transactions/${t.id}` })));
  }
  return hits;
}
