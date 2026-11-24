import { Download } from "lucide-react";
import type { ReportTable as RT } from "@/server/export";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/money";
import { formatNumber, formatPct, formatDay } from "@/lib/format";
import { EmptyState } from "./page";

export function ExportButtons({ report, searchParams }: { report: string; searchParams: Record<string, string | string[] | undefined> }) {
  const qs = (format: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v && k !== "tab") u.set(k, v);
    u.set("format", format);
    return `/api/export/${report}?${u.toString()}`;
  };
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={qs("csv")}>
          <Download /> CSV
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={qs("xlsx")}>
          <Download /> XLSX
        </a>
      </Button>
    </div>
  );
}

export function ReportTableView({ table, totals = true }: { table: RT; totals?: boolean }) {
  if (!table.rows.length) return <EmptyState title="No data for these filters" />;
  const fmt = (v: unknown, type?: string) => {
    if (v === null || v === undefined || v === "") return "—";
    if (type === "money") return formatPeso(Number(v));
    if (type === "number") return formatNumber(Number(v), Number.isInteger(Number(v)) ? 0 : 1);
    if (type === "pct") return formatPct(Number(v));
    if (type === "date") return formatDay(v as Date);
    return String(v);
  };
  const numeric = (t?: string) => t === "money" || t === "number" || t === "pct";
  const NO_TOTAL = new Set(["rank", "version", "avgDays", "absorption", "avgDaysAvailable"]);
  const sums = Object.fromEntries(table.columns.filter((c) => (c.type === "money" || c.type === "number") && !NO_TOTAL.has(c.key)).map((c) => [c.key, table.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)]));
  return (
    <Table>
      <THead>
        <TR>
          {table.columns.map((c) => (
            <TH key={c.key} className={numeric(c.type) ? "text-right" : ""}>
              {c.label}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {table.rows.map((r, i) => (
          <TR key={i}>
            {table.columns.map((c) => (
              <TD key={c.key} className={numeric(c.type) ? "text-right tabular" : "text-sm"}>
                {fmt(r[c.key], c.type)}
              </TD>
            ))}
          </TR>
        ))}
        {totals && Object.keys(sums).length > 0 && (
          <TR className="bg-stone-50 font-semibold">
            {table.columns.map((c, i) => (
              <TD key={c.key} className={numeric(c.type) ? "text-right tabular" : ""}>
                {c.key in sums ? fmt(sums[c.key], c.type) : i === 0 ? "Total" : ""}
              </TD>
            ))}
          </TR>
        )}
      </TBody>
    </Table>
  );
}
