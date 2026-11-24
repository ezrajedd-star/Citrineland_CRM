import { parseDay, manilaToday } from "@/lib/format";

export interface ReportFilters {
  from: Date;
  to: Date;
  developmentId?: string;
  brokerageId?: string;
  brokerId?: string;
  staffId?: string;
  campaignId?: string;
}

/** Parse common report filters from search params. Default period: year to date (Manila). */
export function parseReportFilters(sp: Record<string, string | string[] | undefined>): ReportFilters {
  const g = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const today = manilaToday();
  const from = parseDay(g("from")) ?? new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const toDay = parseDay(g("to")) ?? today;
  const to = new Date(toDay.getTime() + 86_400_000 - 1);
  return { from, to, developmentId: g("developmentId"), brokerageId: g("brokerageId"), brokerId: g("brokerId"), staffId: g("staffId"), campaignId: g("campaignId") };
}
