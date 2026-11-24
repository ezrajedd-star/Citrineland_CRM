import type { Permission } from "@/lib/rbac/permissions";
import type { ReportTable } from "../export";
import type { ReportFilters } from "./filters";
import { commissionsPayable } from "./commissions";

export const REPORTS: Record<string, { title: string; permission: Permission; run: (f: ReportFilters) => Promise<ReportTable> }> = {
  "commissions-payable": { title: "Commissions payable", permission: "commissions:view", run: commissionsPayable },
};
