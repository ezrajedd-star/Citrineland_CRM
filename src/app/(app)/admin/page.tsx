import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import type { Permission } from "@/lib/rbac/permissions";

const TILES: { href: string; title: string; desc: string; perm: Permission }[] = [
  { href: "/admin/users", title: "Users", desc: "Invite, activate/deactivate, delete, force sign-out", perm: "users:view" },
  { href: "/admin/roles", title: "Roles & permissions", desc: "Create roles and edit the permission matrix", perm: "roles:view" },
  { href: "/admin/pipeline", title: "Pipeline stages", desc: "Names, order, colors, probabilities, won/lost", perm: "pipeline:manage" },
  { href: "/admin/picklists", title: "Picklists", desc: "Lead sources, lost reasons, document categories, channels", perm: "settings:view" },
  { href: "/admin/document-templates", title: "Document checklist", desc: "Required transaction documents template", perm: "settings:view" },
  { href: "/admin/settings", title: "Settings", desc: "Holds, parking rule, VAT & fees, financing defaults", perm: "settings:view" },
  { href: "/admin/payment-schemes", title: "Payment schemes", desc: "Spot cash, deferred, DP + bank/Pag-IBIG/in-house", perm: "payment_schemes:manage" },
  { href: "/admin/commission-rules", title: "Commission rules", desc: "Rates, splits and release tranches", perm: "commissions:manage_rules" },
  { href: "/admin/quotas", title: "Quotas", desc: "Monthly/quarterly targets per staff, broker, brokerage", perm: "quotas:manage" },
  { href: "/admin/automations", title: "Automations", desc: "Built-in automations and custom rules", perm: "automations:view" },
  { href: "/admin/integrations", title: "Integrations", desc: "Microsoft 365 status, NetSuite (coming soon)", perm: "integrations:view" },
  { href: "/admin/jobs", title: "Background jobs", desc: "Failed jobs and worker health", perm: "jobs:view" },
  { href: "/admin/audit", title: "Audit log", desc: "Every change to core records, document downloads", perm: "audit:view" },
  { href: "/admin/auth-log", title: "Sign-in log", desc: "Sign-ins, failures and sign-outs", perm: "audit:view" },
  { href: "/admin/privacy", title: "Data privacy", desc: "Export or anonymize client data (RA 10173)", perm: "clients:export" },
];

export default async function AdminHome() {
  const user = await requireUser();
  const tiles = TILES.filter((t) => user.permissions.has(t.perm) || user.permissions.has("*"));
  return (
    <>
      <PageHeader title="Administration" description="System configuration for Citrineland CRM" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:border-brand-300">
            <div className="font-medium text-stone-900">{t.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
