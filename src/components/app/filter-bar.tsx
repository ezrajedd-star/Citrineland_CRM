import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type FilterDef =
  | { type: "search"; name: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { type: "date"; name: string; label: string };

/** GET form of filters; works without JS and keeps URLs shareable. */
export function FilterBar({ filters, values, basePath, extra }: { filters: FilterDef[]; values: Record<string, string | string[] | undefined>; basePath: string; extra?: React.ReactNode }) {
  const v = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : "");
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 border-b p-3">
      {filters.map((f) => {
        if (f.type === "search")
          return (
            <div key={f.name} className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input name={f.name} defaultValue={v(f.name)} placeholder={f.placeholder ?? "Search…"} className="pl-8" />
            </div>
          );
        if (f.type === "date")
          return (
            <label key={f.name} className="flex flex-col gap-1 text-xs text-stone-500">
              {f.label}
              <Input type="date" name={f.name} defaultValue={v(f.name)} className="w-[150px]" />
            </label>
          );
        return (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-stone-500">
            {f.label}
            <NativeSelect name={f.name} defaultValue={v(f.name)} className="min-w-[140px]">
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        );
      })}
      {extra}
      <Button type="submit" variant="secondary" size="default">
        Apply
      </Button>
      <Button asChild variant="ghost">
        <Link href={basePath}>Reset</Link>
      </Button>
    </form>
  );
}

export function sp(searchParams: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = searchParams[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function pageParams(searchParams: Record<string, string | string[] | undefined>, pageSize = 25) {
  const page = Math.max(1, Number(sp(searchParams, "page") ?? 1) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
