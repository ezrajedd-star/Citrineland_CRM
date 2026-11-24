/**
 * Permission catalog. A permission is "resource:action".
 * The matrix UI renders resources as rows and the union of actions as columns.
 */
export const PERMISSION_CATALOG = {
  users: { label: "Users", actions: ["view", "create", "update", "delete"] },
  roles: { label: "Roles & permissions", actions: ["view", "manage"] },
  settings: { label: "Settings & picklists", actions: ["view", "update"] },
  audit: { label: "Audit log", actions: ["view"] },
  integrations: { label: "Integrations", actions: ["view", "manage"] },
  jobs: { label: "Background jobs", actions: ["view", "manage"] },
  developments: { label: "Developments", actions: ["view", "create", "update", "delete"] },
  units: { label: "Inventory (units & parking)", actions: ["view", "create", "update", "delete", "import", "block"] },
  price_lists: { label: "Price lists", actions: ["view", "update"] },
  payment_schemes: { label: "Payment schemes", actions: ["view", "manage"] },
  holds: { label: "Unit holds", actions: ["create", "release"] },
  brokers: { label: "Brokers & brokerages", actions: ["view", "create", "update", "delete"] },
  leads: { label: "Leads", actions: ["view", "create", "update", "delete", "override_broker", "view_all"] },
  pipeline: { label: "Pipeline stages", actions: ["manage"] },
  clients: { label: "Clients", actions: ["view", "create", "update", "delete", "export"] },
  kyc: { label: "KYC documents", actions: ["view", "upload"] },
  computations: { label: "Sample computations", actions: ["view", "create", "send"] },
  transactions: { label: "Transactions", actions: ["view", "create", "update", "delete", "cancel", "transfer"] },
  documents: { label: "Transaction documentation", actions: ["view", "update", "verify"] },
  payments: { label: "Payments", actions: ["view", "create", "import", "void"] },
  commissions: { label: "Commissions", actions: ["view", "manage_rules", "approve", "release", "adjust"] },
  quotas: { label: "Quotas", actions: ["view", "manage"] },
  campaigns: { label: "Campaigns & web forms", actions: ["view", "manage"] },
  sequences: { label: "Email templates & sequences", actions: ["view", "manage"] },
  automations: { label: "Automations", actions: ["view", "manage"] },
  tasks: { label: "Tasks", actions: ["view_all", "manage_all"] },
  reports: { label: "Reports", actions: ["view_sales", "view_marketing", "view_pipeline", "view_financial", "view_inventory", "export"] },
} as const satisfies Record<string, { label: string; actions: readonly string[] }>;

type Catalog = typeof PERMISSION_CATALOG;
export type Resource = keyof Catalog;
export type Permission = {
  [R in Resource]: `${R}:${Catalog[R]["actions"][number]}`;
}[Resource];

export const ALL_PERMISSIONS: Permission[] = (Object.keys(PERMISSION_CATALOG) as Resource[]).flatMap((r) =>
  PERMISSION_CATALOG[r].actions.map((a) => `${r}:${a}` as Permission),
);

export const ALL_ACTIONS: string[] = Array.from(
  new Set((Object.keys(PERMISSION_CATALOG) as Resource[]).flatMap((r) => [...PERMISSION_CATALOG[r].actions])),
);

export function isPermission(p: string): p is Permission {
  return (ALL_PERMISSIONS as string[]).includes(p);
}

export const PERMISSION_DESCRIPTIONS: Partial<Record<Permission, string>> = {
  "price_lists:update": "Change prices (creates a new price list version)",
  "transactions:cancel": "Cancel transactions (releases inventory, forfeits commissions)",
  "commissions:approve": "Approve due commission tranches",
  "commissions:release": "Record release of approved commissions",
  "leads:override_broker": "Reassign the broker of record (requires a reason)",
  "leads:view_all": "See leads owned by other staff",
  "kyc:view": "View and download KYC documents",
  "clients:export": "Export or anonymize client data (Data Privacy Act)",
};

const all = (r: Resource) => PERMISSION_CATALOG[r].actions.map((a) => `${r}:${a}` as Permission);

export type SystemRoleKey = "ADMIN" | "SALES_MANAGER" | "MARKETING_MANAGER" | "BNG_STAFF";

export const DEFAULT_ROLES: Record<SystemRoleKey, { name: string; description: string; permissions: Permission[] | ["*"] }> = {
  ADMIN: {
    name: "Admin",
    description: "System owner. Everything, including users, roles, settings and the audit log.",
    permissions: ["*"],
  },
  SALES_MANAGER: {
    name: "Sales Manager",
    description: "Owns sales performance: leads, clients, transactions, holds/reservations, commissions, quotas.",
    permissions: [
      ...all("leads"),
      ...all("clients").filter((p) => p !== "clients:export"),
      "kyc:view",
      "kyc:upload",
      ...all("transactions"),
      ...all("documents"),
      "payments:view",
      "payments:create",
      "payments:import",
      ...all("holds"),
      ...all("computations"),
      "commissions:view",
      "commissions:approve",
      "commissions:adjust",
      ...all("quotas"),
      ...all("reports"),
      "developments:view",
      "units:view",
      "units:block",
      "price_lists:view",
      "payment_schemes:view",
      "brokers:view",
      "campaigns:view",
      "sequences:view",
      "automations:view",
      "tasks:view_all",
      "tasks:manage_all",
    ],
  },
  MARKETING_MANAGER: {
    name: "Marketing Manager",
    description: "Owns lead generation: leads, campaigns, email sequences, lead sources and web forms.",
    permissions: [
      ...all("leads").filter((p) => p !== "leads:override_broker"),
      ...all("campaigns"),
      ...all("sequences"),
      "automations:view",
      "computations:view",
      "computations:create",
      "computations:send",
      "reports:view_marketing",
      "reports:view_pipeline",
      "reports:export",
      "transactions:view",
      "developments:view",
      "units:view",
      "price_lists:view",
      "payment_schemes:view",
      "brokers:view",
      "clients:view",
      "settings:view",
      "tasks:view_all",
    ],
  },
  BNG_STAFF: {
    name: "BNG Staff",
    description: "Broker's Network Group: broker accreditation, broker records, encoding and documentation.",
    permissions: [
      ...all("brokers"),
      "leads:view",
      "leads:create",
      "leads:update",
      "leads:view_all",
      "clients:view",
      "clients:create",
      "clients:update",
      "kyc:view",
      "kyc:upload",
      "transactions:view",
      "transactions:create",
      "transactions:update",
      "documents:view",
      "documents:update",
      "documents:verify",
      "payments:view",
      "payments:create",
      "holds:create",
      "computations:view",
      "computations:create",
      "computations:send",
      "developments:view",
      "units:view",
      "price_lists:view",
      "payment_schemes:view",
      "commissions:view",
      "reports:view_pipeline",
      "reports:view_inventory",
    ],
  },
};
