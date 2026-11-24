import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={b.href}>
                {i > 0 && <span>/</span>}
                <Link href={b.href} className="hover:text-brand-700 hover:underline">
                  {b.label}
                </Link>
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold text-stone-900">{title}</h1>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full bg-stone-100 p-3 text-stone-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LinkTabs({ tabs, active, baseHref }: { tabs: { key: string; label: string; count?: number }[]; active: string; baseHref: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}tab=${t.key}`}
          scroll={false}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            active === t.key ? "border-brand-600 font-medium text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Server-side pagination links that keep existing query params */
export function Pagination({ page, pageSize, total, searchParams, basePath }: { page: number; pageSize: number; total: number; searchParams: Record<string, string | string[] | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link className="rounded p-1 hover:bg-stone-100" href={href(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="p-1 opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}
        <span>
          Page {page} / {pages}
        </span>
        {page < pages ? (
          <Link className="rounded p-1 hover:bg-stone-100" href={href(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="p-1 opacity-30">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "warn" | "danger" | "good"; href?: string }) {
  const inner = (
    <div className={cn("rounded-lg border bg-white p-4 shadow-sm", href && "transition-colors hover:border-brand-300")}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular text-stone-900", tone === "warn" && "text-amber-700", tone === "danger" && "text-red-700", tone === "good" && "text-green-700")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function DL({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: 2 | 3 | 4 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 text-sm", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "sm:grid-cols-4")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="truncate text-stone-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  INVITED: "info",
  DEACTIVATED: "secondary",
  AVAILABLE: "success",
  ON_HOLD: "warning",
  RESERVED: "info",
  SOLD: "secondary",
  BLOCKED: "danger",
  PENDING: "warning",
  ACCREDITED: "success",
  SUSPENDED: "danger",
  EXPIRED: "danger",
  SUBMITTED: "info",
  VERIFIED: "success",
  REJECTED: "danger",
  NOT_DUE: "secondary",
  DUE: "warning",
  APPROVED: "info",
  RELEASED: "success",
  FORFEITED: "danger",
  CANCELLED: "danger",
  TRANSFERRED: "secondary",
  FULLY_PAID: "success",
  TURNED_OVER: "success",
  TITLED: "success",
  DOCUMENTATION: "warning",
  CONTRACT_SIGNED: "info",
  DOWNPAYMENT_IN_PROGRESS: "info",
  DOWNPAYMENT_COMPLETE: "info",
  FOR_LOAN_TAKEOUT: "info",
  BALANCE_IN_PROGRESS: "info",
  OPEN: "info",
  IN_PROGRESS: "warning",
  DONE: "success",
  CONNECTED: "success",
  ERROR: "danger",
  DISCONNECTED: "secondary",
  COMPLETED: "success",
  STOPPED: "secondary",
  PRE_SELLING: "default",
  RFO: "info",
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "secondary",
  LOW: "secondary",
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>{label ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
