import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { REPORTS } from "@/server/reports/registry";
import { parseReportFilters } from "@/server/reports/filters";
import { toCsv, toXlsx } from "@/server/export";
import { manilaDateKey } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/export/<report>?format=csv|xlsx&from=&to=&developmentId=… */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (!can(user, def.permission) || !can(user, "reports:export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const result = await def.run(parseReportFilters(sp));
  const table = result.tables[Number(sp.table ?? 0)] ?? result.tables[0];
  await audit({ userId: user.id, ip: await clientIp() }, { entity: "Report", entityId: report, action: "export", after: { format: sp.format ?? "csv", filters: sp, rows: table.rows.length } });
  const base = `citrineland-${report}-${manilaDateKey()}`;
  if (sp.format === "xlsx") {
    return new NextResponse(new Uint8Array(await toXlsx(result.tables)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  return new NextResponse(toCsv(table), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
