import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";

export async function userOptions() {
  const u = await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE", type: "STAFF" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return u.map((x) => ({ value: x.id, label: x.name }));
}
export async function brokerOptions() {
  const b = await prisma.broker.findMany({ where: { deletedAt: null }, include: { brokerage: { select: { name: true } } }, orderBy: [{ lastName: "asc" }] });
  return b.map((x) => ({ value: x.id, label: `${fullName(x)}${x.brokerage ? ` — ${x.brokerage.name}` : " (independent)"}${x.accreditationStatus !== "ACCREDITED" ? ` [${x.accreditationStatus.toLowerCase()}]` : ""}` }));
}
export async function brokerageOptions() {
  const b = await prisma.brokerage.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return b.map((x) => ({ value: x.id, label: x.name }));
}
export async function developmentOptions() {
  const d = await prisma.development.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return d.map((x) => ({ value: x.id, label: x.name }));
}
export async function campaignOptions() {
  const c = await prisma.campaign.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, active: true } });
  return c.map((x) => ({ value: x.id, label: `${x.name}${x.active ? "" : " (ended)"}` }));
}
export async function stageOptions(includeWon = false) {
  const s = await prisma.pipelineStage.findMany({ where: { active: true, ...(includeWon ? {} : { isWon: false }) }, orderBy: { order: "asc" } });
  return s.map((x) => ({ value: x.id, label: x.name }));
}
export async function clientOptions(take = 500) {
  const c = await prisma.client.findMany({ where: { deletedAt: null, anonymizedAt: null }, orderBy: { updatedAt: "desc" }, take, select: { id: true, firstName: true, lastName: true, mobile: true } });
  return c.map((x) => ({ value: x.id, label: `${fullName(x)}${x.mobile ? ` · ${x.mobile}` : ""}` }));
}
