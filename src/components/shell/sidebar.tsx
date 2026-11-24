"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  KanbanSquare,
  Users,
  FileSignature,
  HandCoins,
  Building2,
  Grid3x3,
  BadgeCheck,
  Megaphone,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/logo";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, CheckSquare, KanbanSquare, Users, FileSignature, HandCoins, Building2, Grid3x3, BadgeCheck, Megaphone, BarChart3, Settings };

export function Sidebar({ sections, overdueTasks }: { sections: { section?: string; items: { href: string; label: string; icon: string }[] }[]; overdueTasks: number }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-white md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((s, i) => (
          <div key={i} className="mb-3">
            {s.section && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{s.section}</div>}
            {s.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                    active && "bg-brand-50 font-medium text-brand-800 hover:bg-brand-50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/tasks" && overdueTasks > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white" title="Overdue tasks">
                      {overdueTasks}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav({ sections }: { sections: { section?: string; items: { href: string; label: string; icon: string }[] }[] }) {
  return (
    <details className="relative md:hidden">
      <summary className="cursor-pointer list-none rounded-md border px-2 py-1 text-sm">Menu</summary>
      <div className="absolute left-0 z-40 mt-1 w-56 rounded-md border bg-white p-2 shadow-lg">
        {sections.flatMap((s) => s.items).map((i) => (
          <Link key={i.href} href={i.href} className="block rounded px-2 py-1.5 text-sm hover:bg-stone-100">
            {i.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
