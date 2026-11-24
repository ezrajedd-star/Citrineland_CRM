"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bell, CheckSquare, LogOut, Search, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileNav } from "./sidebar";

type Notif = { id: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null };

export function Topbar({
  user,
  openTasks,
  overdueTasks,
  notifications,
  unread,
  markRead,
  signOutAction,
  sections,
}: {
  user: { name: string; email: string; roleName: string };
  openTasks: number;
  overdueTasks: number;
  notifications: Notif[];
  unread: number;
  markRead: (args: { ids?: string[]; all?: boolean }) => Promise<unknown>;
  signOutAction: () => Promise<void>;
  sections: { section?: string; items: { href: string; label: string; icon: string }[] }[];
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur">
      <MobileNav sections={sections} />
      <form
        className="relative max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, clients, brokers, units, transactions, phone…" className="pl-8" aria-label="Global search" />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <Link href="/tasks" className="relative flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100" title="My open tasks">
          <CheckSquare className="h-4 w-4" />
          <span className="tabular">{openTasks}</span>
          {overdueTasks > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{overdueTasks} overdue</span>}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="relative rounded-md p-2 text-stone-600 hover:bg-stone-100" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold text-stone-500">Notifications</span>
              {unread > 0 && (
                <button className="text-xs text-brand-700 hover:underline" onClick={async () => { await markRead({ all: true }); router.refresh(); }}>
                  Mark all read
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">You're all caught up.</div>}
              {notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex-col items-start gap-0.5"
                  onSelect={async () => {
                    if (!n.readAt) await markRead({ ids: [n.id] });
                    if (n.link) router.push(n.link);
                    else router.refresh();
                  }}
                >
                  <span className={n.readAt ? "text-stone-600" : "font-medium text-stone-900"}>{n.title}</span>
                  {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[10px] text-stone-400">{new Date(n.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</span>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/notifications")}>View all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-stone-100" aria-label="User menu">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="hidden text-left text-xs leading-tight lg:block">
              <span className="block font-medium text-stone-800">{user.name}</span>
              <span className="block text-stone-500">{user.roleName}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => router.push("/profile")}>
              <User /> Profile & Microsoft 365
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
