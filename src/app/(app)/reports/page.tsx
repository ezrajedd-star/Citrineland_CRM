import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/app/page";
import { FilterBar } from "@/components/app/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTableView, ExportButtons } from "@/components/app/report-table";
import { Chart } from "@/components/charts/chart";
import { REPORTS } from "@/server/reports/registry";
import { parseReportFilters } from "@/server/reports/filters";
import { developmentOptions, brokerageOptions, brokerOptions, userOptions, campaignOptions } from "@/server/queries/options";
import { dayInput, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const visible = Object.entries(REPORTS).filter(([k, r]) => k !== "commissions-payable" && can(user, r.permission));
  if (!visible.length) redirect("/forbidden?p=reports");
  const key = sp.r && visible.some(([k]) => k === sp.r) ? sp.r : visible[0][0];
  const def = REPORTS[key];
  const f = parseReportFilters(sp);
  const [result, devs, brokerages, brokers, users, campaigns] = await Promise.all([def.run(f), developmentOptions(), brokerageOptions(), brokerOptions(), userOptions(), campaignOptions()]);
  const values = { ...sp, from: sp.from ?? dayInput(f.from), to: sp.to ?? dayInput(f.to) };
  return (
    <>
      <PageHeader title="Reports" description="Live data. All reports filter by period, development, brokerage/broker and staff, and export to CSV/XLSX." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {visible.map(([k, r]) => (
            <Link key={k} href={`/reports?${new URLSearchParams({ ...(sp as Record<string, string>), r: k }).toString()}`} className={cn("block rounded-md px-3 py-2 text-sm hover:bg-stone-100", k === key && "bg-brand-50 font-medium text-brand-800")}>
              {r.title}
              <span className="block text-[11px] font-normal text-muted-foreground">{r.description}</span>
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <Card>
            <FilterBar
              basePath="/reports"
              values={values}
              extra={<input type="hidden" name="r" value={key} />}
              filters={[
                { type: "date", name: "from", label: "From" },
                { type: "date", name: "to", label: "To" },
                { type: "select", name: "developmentId", label: "Development", options: devs },
                { type: "select", name: "brokerageId", label: "Brokerage", options: brokerages },
                { type: "select", name: "brokerId", label: "Broker", options: brokers },
                { type: "select", name: "staffId", label: "Staff", options: users },
                ...(key === "marketing" || key === "funnel" ? [{ type: "select" as const, name: "campaignId", label: "Campaign", options: campaigns }] : []),
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-semibold">{def.title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDay(f.from)} – {formatDay(f.to)}
                  {result.note ? ` · ${result.note}` : ""}
                </div>
              </div>
              {can(user, "reports:export") && <ExportButtons report={key} searchParams={{ ...values, r: undefined }} />}
            </div>
          </Card>
          {result.charts && result.charts.length > 0 && (
            <div className={cn("grid grid-cols-1 gap-4", result.charts.length > 1 && "xl:grid-cols-2")}>
              {result.charts.map((c) => (
                <Card key={c.title}>
                  <CardHeader>
                    <CardTitle>{c.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart spec={c.spec} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {result.tables.map((t, i) => (
            <Card key={t.title}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t.title}</CardTitle>
                {i > 0 && can(user, "reports:export") && <ExportButtons report={key} searchParams={{ ...values, r: undefined, table: String(i) }} />}
              </CardHeader>
              {t.rows.length ? <ReportTableView table={t} totals={!["Conversion funnel", "Quota vs actual", "Price list history"].includes(t.title)} /> : <EmptyState title="No data for these filters" />}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
