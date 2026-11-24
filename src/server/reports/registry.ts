import type { Permission } from "@/lib/rbac/permissions";
import type { ReportFilters } from "./filters";
import { commissionsPayable } from "./commissions";
import { salesReport, funnelReport, brokerReport, quotaReport, inventoryReport, collectionsReport, commissionsReport, marketingReport, type ReportResult } from "./core";

export interface ReportDef {
  title: string;
  description: string;
  permission: Permission;
  run: (f: ReportFilters) => Promise<ReportResult>;
}

export const REPORTS: Record<string, ReportDef> = {
  sales: { title: "Sales", description: "Reservations, net sales and TCP booked by month, development and unit type", permission: "reports:view_sales", run: salesReport },
  funnel: { title: "Conversion funnel", description: "Leads reaching each stage, conversion %, average days per stage, lost reasons", permission: "reports:view_pipeline", run: funnelReport },
  brokers: { title: "Broker performance", description: "Leads, reservations, sales value, cancellation and conversion rates, ranking", permission: "reports:view_sales", run: brokerReport },
  quotas: { title: "Quota vs actual", description: "Units and value against quotas per staff, broker or brokerage", permission: "reports:view_sales", run: quotaReport },
  inventory: { title: "Inventory", description: "Status by development, absorption, aging, price list history", permission: "reports:view_inventory", run: inventoryReport },
  collections: { title: "Collections", description: "Collected vs due and arrears aging from recorded payments", permission: "reports:view_financial", run: collectionsReport },
  commissions: { title: "Commissions", description: "Earned, due, approved, released and forfeited by broker", permission: "reports:view_financial", run: commissionsReport },
  marketing: { title: "Marketing", description: "Leads and reservations by source/campaign, cost per lead/reservation, sequences", permission: "reports:view_marketing", run: marketingReport },
  "commissions-payable": { title: "Commissions payable", description: "Outstanding commissions by broker", permission: "commissions:view", run: async (f) => ({ tables: [await commissionsPayable(f)] }) },
};
