import type { Permission } from "@/lib/rbac/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Visible if the user has any of these permissions (empty = everyone) */
  anyOf?: Permission[];
}

export const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/tasks", label: "My Tasks", icon: "CheckSquare" },
    ],
  },
  {
    section: "Sales",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: "KanbanSquare", anyOf: ["leads:view"] },
      { href: "/clients", label: "Clients", icon: "Users", anyOf: ["clients:view"] },
      { href: "/transactions", label: "Transactions", icon: "FileSignature", anyOf: ["transactions:view"] },
      { href: "/commissions", label: "Commissions", icon: "HandCoins", anyOf: ["commissions:view"] },
    ],
  },
  {
    section: "Inventory",
    items: [
      { href: "/developments", label: "Developments", icon: "Building2", anyOf: ["developments:view"] },
      { href: "/inventory", label: "Inventory", icon: "Grid3x3", anyOf: ["units:view"] },
    ],
  },
  {
    section: "Network",
    items: [{ href: "/brokers", label: "Brokers", icon: "BadgeCheck", anyOf: ["brokers:view"] }],
  },
  {
    section: "Growth",
    items: [
      { href: "/marketing", label: "Marketing", icon: "Megaphone", anyOf: ["campaigns:view", "sequences:view"] },
      { href: "/reports", label: "Reports", icon: "BarChart3", anyOf: ["reports:view_sales", "reports:view_marketing", "reports:view_pipeline", "reports:view_financial", "reports:view_inventory"] },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin", label: "Administration", icon: "Settings", anyOf: ["users:view", "roles:view", "settings:view", "audit:view", "integrations:view", "jobs:view", "pipeline:manage", "automations:view", "commissions:manage_rules", "quotas:manage", "payment_schemes:manage"] },
    ],
  },
];
