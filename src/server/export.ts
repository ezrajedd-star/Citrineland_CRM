import ExcelJS from "exceljs";

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "money" | "number" | "date" | "pct";
}
export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  /** Money values are centavos (number); exported as pesos */
  rows: Record<string, unknown>[];
}

function cell(v: unknown, type?: ReportColumn["type"]) {
  if (v === null || v === undefined) return "";
  if (type === "money") return Number(v) / 100;
  if (type === "date" && v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "bigint") return Number(v);
  return v as any;
}

export function toCsv(t: ReportTable): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = t.columns.map((c) => esc(c.label + (c.type === "money" ? " (PHP)" : ""))).join(",");
  const lines = t.rows.map((r) => t.columns.map((c) => esc(cell(r[c.key], c.type))).join(","));
  return "﻿" + [head, ...lines].join("\r\n");
}

export async function toXlsx(input: ReportTable | ReportTable[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Citrineland CRM";
  for (const t of Array.isArray(input) ? input : [input]) addSheet(wb, t);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addSheet(wb: ExcelJS.Workbook, t: ReportTable) {
  const ws = wb.addWorksheet(t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  ws.columns = t.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4), style: c.type === "money" ? { numFmt: '"₱"#,##0.00' } : c.type === "pct" ? { numFmt: "0.0" } : {} }));
  ws.getRow(1).font = { bold: true };
  for (const r of t.rows) ws.addRow(Object.fromEntries(t.columns.map((c) => [c.key, cell(r[c.key], c.type)])));
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
