import { prisma } from "./db";

export const PICKLIST_TYPES = {
  LEAD_SOURCE: "Lead sources",
  LOST_REASON: "Lost reasons",
  DOCUMENT_CATEGORY: "Document categories",
  CAMPAIGN_CHANNEL: "Campaign channels",
} as const;

export async function picklist(type: keyof typeof PICKLIST_TYPES, includeInactive = false) {
  const rows = await prisma.picklist.findMany({ where: { type, ...(includeInactive ? {} : { active: true }) }, orderBy: [{ order: "asc" }, { label: "asc" }] });
  return rows.map((r) => ({ value: r.code, label: r.label }));
}

export async function picklistLabel(type: keyof typeof PICKLIST_TYPES): Promise<Map<string, string>> {
  const rows = await prisma.picklist.findMany({ where: { type } });
  return new Map(rows.map((r) => [r.code, r.label]));
}
