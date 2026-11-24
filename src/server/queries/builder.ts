import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { fullName } from "@/lib/utils";
import { formatPeso } from "@/lib/money";
import { leadScope } from "@/server/leads";
import { brokerOptions, clientOptions, developmentOptions, userOptions } from "./options";

export async function loadBuilderData(user: CurrentUser, initial: { unitId?: string; parkingSlotId?: string; holdId?: string; leadId?: string; clientId?: string; paymentSchemeId?: string }) {
  const holdInc = { where: { status: "ACTIVE" as const }, select: { id: true, placedById: true }, take: 1 };
  const [developments, units, slots, schemes, leads, clients, brokers, users] = await Promise.all([
    developmentOptions(),
    prisma.unit.findMany({ where: { deletedAt: null, OR: [{ status: "AVAILABLE" }, { status: "ON_HOLD" }] }, include: { holds: holdInc }, orderBy: { code: "asc" } }),
    prisma.parkingSlot.findMany({ where: { deletedAt: null, OR: [{ status: "AVAILABLE" }, { status: "ON_HOLD" }] }, include: { holds: holdInc }, orderBy: { code: "asc" } }),
    prisma.paymentScheme.findMany({ where: { active: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.lead.findMany({ where: { deletedAt: null, ...leadScope(user), stage: { isWon: false, isLost: false } }, orderBy: { updatedAt: "desc" }, take: 500, select: { id: true, firstName: true, lastName: true, mobile: true, brokerId: true } }),
    clientOptions(),
    brokerOptions(),
    userOptions(),
  ]);
  const toItem = (x: any, kind: "UNIT" | "PARKING") => {
    const h = x.holds[0];
    const mine = !!h && (h.placedById === user.id || h.id === initial.holdId);
    return {
      id: x.id,
      code: x.code,
      developmentId: x.developmentId,
      sectionId: x.sectionId,
      status: x.status,
      priceCents: Number(x.listPriceCents),
      label: `${x.code}${kind === "UNIT" && x.model ? ` · ${x.model}` : kind === "PARKING" ? ` · ${x.type.toLowerCase()}` : ""} · ${formatPeso(x.listPriceCents)}${x.status === "ON_HOLD" ? (mine ? " · your hold" : " · on hold") : ""}`,
      holdId: mine ? h.id : null,
      holdMine: mine,
    };
  };
  let initialLead = initial.leadId ? leads.find((l) => l.id === initial.leadId) : undefined;
  if (initial.leadId && !initialLead) {
    const l = await prisma.lead.findUnique({ where: { id: initial.leadId }, select: { id: true, firstName: true, lastName: true, mobile: true, brokerId: true } });
    if (l) {
      leads.unshift(l);
      initialLead = l;
    }
  }
  const unit = initial.unitId ? units.find((u) => u.id === initial.unitId) : undefined;
  const slot = initial.parkingSlotId ? slots.find((u) => u.id === initial.parkingSlotId) : undefined;
  return {
    developments,
    units: units.map((u) => toItem(u, "UNIT")),
    slots: slots.map((s) => toItem(s, "PARKING")),
    schemes: schemes.map((s) => ({ id: s.id, name: s.name, developmentId: s.developmentId })),
    leads: leads.map((l) => ({ value: l.id, label: `${fullName(l)}${l.mobile ? ` · ${l.mobile}` : ""}` })),
    clients,
    brokers,
    users,
    initial: {
      developmentId: unit?.developmentId ?? slot?.developmentId,
      unitId: initial.unitId,
      parkingSlotIds: initial.parkingSlotId ? [initial.parkingSlotId] : [],
      holdId: initial.holdId,
      leadId: initial.leadId,
      clientId: initial.clientId,
      brokerId: initialLead?.brokerId ?? undefined,
      paymentSchemeId: initial.paymentSchemeId,
    },
  };
}
