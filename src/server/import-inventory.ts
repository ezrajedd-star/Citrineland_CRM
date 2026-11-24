import Papa from "papaparse";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, type ActorCtx } from "@/lib/audit";
import { manilaToday } from "@/lib/format";
import { createPriceListVersion, type PriceChangeItem } from "./price-lists";
import { DomainError } from "@/domain/errors";

export const IMPORT_COLUMNS = ["kind", "section_code", "code", "floor", "block", "lot", "unit_type", "model", "floor_area", "lot_area", "bedrooms", "bathrooms", "orientation", "parking_type", "level", "price", "notes"] as const;

const num = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[₱,\s]/g, ""))), z.number().finite().nullable());
const int = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().nullable());
const str = z.preprocess((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim()), z.string().max(200).nullable());

export const importRowSchema = z
  .object({
    kind: z.preprocess((v) => String(v ?? "UNIT").trim().toUpperCase() || "UNIT", z.enum(["UNIT", "PARKING"])),
    section_code: str,
    code: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1, "code is required").max(40)),
    floor: int,
    block: str,
    lot: str,
    unit_type: z.preprocess((v) => (v ? String(v).trim().toUpperCase().replace(/[\s&]+/g, "_").replace("HOUSE_LOT", "HOUSE_AND_LOT") : null), z.enum(["CONDO", "HOUSE_AND_LOT", "LOT_ONLY"]).nullable()),
    model: str,
    floor_area: num,
    lot_area: num,
    bedrooms: int,
    bathrooms: int,
    orientation: str,
    parking_type: z.preprocess((v) => (v ? String(v).trim().toUpperCase() : null), z.enum(["REGULAR", "TANDEM", "PWD", "EV"]).nullable()),
    level: str,
    price: num.refine((v) => v === null || v >= 0, "price must be positive"),
    notes: str,
  })
  .superRefine((r, ctx) => {
    if (r.kind === "UNIT" && !r.unit_type) ctx.addIssue({ code: "custom", path: ["unit_type"], message: "unit_type is required for units (CONDO, HOUSE_AND_LOT, LOT_ONLY)" });
  });

export type ImportRow = z.infer<typeof importRowSchema>;
export interface PreviewRow {
  line: number;
  raw: Record<string, string>;
  data: ImportRow | null;
  action: "create" | "update" | "error";
  priceChange: boolean;
  errors: string[];
}

export async function parseFile(file: File): Promise<Record<string, string>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const res = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") });
    return res.data;
  }
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => (headers[i] = String(c.value ?? "").trim().toLowerCase().replace(/\s+/g, "_")));
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const o: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (c, i) => {
        const v: any = c.value;
        o[headers[i]] = v && typeof v === "object" && "result" in v ? String(v.result) : v === null || v === undefined ? "" : String(v);
      });
      if (Object.values(o).some((v) => v !== "")) rows.push(o);
    });
    return rows;
  }
  throw new DomainError("Upload a .csv or .xlsx file.");
}

export async function previewImport(developmentId: string, rows: Record<string, string>[], canChangePrices: boolean): Promise<PreviewRow[]> {
  if (rows.length > 5000) throw new DomainError("Import up to 5,000 rows at a time.");
  const [units, slots, sections] = await Promise.all([
    prisma.unit.findMany({ where: { developmentId, deletedAt: null }, select: { code: true, listPriceCents: true } }),
    prisma.parkingSlot.findMany({ where: { developmentId, deletedAt: null }, select: { code: true, listPriceCents: true } }),
    prisma.section.findMany({ where: { developmentId, deletedAt: null }, select: { code: true } }),
  ]);
  const unitMap = new Map(units.map((u) => [u.code.toLowerCase(), u]));
  const slotMap = new Map(slots.map((u) => [u.code.toLowerCase(), u]));
  const sectionCodes = new Set(sections.map((s) => s.code.toLowerCase()));
  const seen = new Set<string>();
  return rows.map((raw, i) => {
    const parsed = importRowSchema.safeParse(raw);
    const errors: string[] = [];
    if (!parsed.success) for (const iss of parsed.error.issues) errors.push(`${iss.path.join(".")}: ${iss.message}`);
    const data = parsed.success ? parsed.data : null;
    let action: PreviewRow["action"] = "error";
    let priceChange = false;
    if (data) {
      const key = `${data.kind}:${data.code.toLowerCase()}`;
      if (seen.has(key)) errors.push(`duplicate code ${data.code} in file`);
      seen.add(key);
      const existing = data.kind === "UNIT" ? unitMap.get(data.code.toLowerCase()) : slotMap.get(data.code.toLowerCase());
      if (data.section_code && !sectionCodes.has(data.section_code.toLowerCase())) errors.push(`section_code "${data.section_code}" not found in this development`);
      if (!existing && data.price === null) errors.push("price is required for new items");
      if (existing && data.price !== null && Math.round(data.price * 100) !== Number(existing.listPriceCents)) {
        priceChange = true;
        if (!canChangePrices) errors.push("price differs from current list price and you don't have price_lists:update");
      }
      action = errors.length ? "error" : existing ? "update" : "create";
    }
    return { line: i + 2, raw, data, action, priceChange, errors };
  });
}

export async function commitImport(developmentId: string, rows: Record<string, string>[], canChangePrices: boolean, ctx: ActorCtx, effectiveDate = manilaToday()) {
  const preview = await previewImport(developmentId, rows, canChangePrices);
  const bad = preview.filter((r) => r.action === "error");
  if (bad.length) throw new DomainError(`${bad.length} row(s) have errors. Fix them and preview again.`);
  return prisma.$transaction(
    async (tx) => {
      const sections = await tx.section.findMany({ where: { developmentId, deletedAt: null } });
      const sectionId = (code: string | null) => (code ? (sections.find((s) => s.code.toLowerCase() === code.toLowerCase())?.id ?? null) : null);
      const priceItems: PriceChangeItem[] = [];
      let created = 0;
      let updated = 0;
      for (const r of preview) {
        const d = r.data!;
        if (d.kind === "UNIT") {
          const data = {
            sectionId: sectionId(d.section_code),
            floor: d.floor,
            block: d.block,
            lot: d.lot,
            unitType: d.unit_type!,
            model: d.model,
            floorArea: d.floor_area,
            lotArea: d.lot_area,
            bedrooms: d.bedrooms,
            bathrooms: d.bathrooms,
            orientation: d.orientation,
            notes: d.notes,
          };
          const existing = await tx.unit.findFirst({ where: { developmentId, code: d.code, deletedAt: null } });
          const u = existing ? await tx.unit.update({ where: { id: existing.id }, data }) : await tx.unit.create({ data: { ...data, developmentId, code: d.code, listPriceCents: 0n, createdById: ctx.userId } });
          if (existing) updated++;
          else created++;
          if ((!existing || r.priceChange) && d.price !== null) priceItems.push({ kind: "UNIT", id: u.id, priceCents: Math.round(d.price * 100) });
        } else {
          const data = { sectionId: sectionId(d.section_code), level: d.level, type: d.parking_type ?? "REGULAR", notes: d.notes };
          const existing = await tx.parkingSlot.findFirst({ where: { developmentId, code: d.code, deletedAt: null } });
          const s = existing ? await tx.parkingSlot.update({ where: { id: existing.id }, data }) : await tx.parkingSlot.create({ data: { ...data, developmentId, code: d.code, listPriceCents: 0n, createdById: ctx.userId } });
          if (existing) updated++;
          else created++;
          if ((!existing || r.priceChange) && d.price !== null) priceItems.push({ kind: "PARKING", id: s.id, priceCents: Math.round(d.price * 100) });
        }
      }
      if (priceItems.length) await createPriceListVersion({ developmentId, effectiveDate, notes: `Import (${priceItems.length} prices)`, items: priceItems }, ctx, tx);
      await audit(ctx, { entity: "Development", entityId: developmentId, action: "inventory_import", after: { created, updated, prices: priceItems.length } }, tx);
      return { created, updated, prices: priceItems.length };
    },
    { timeout: 120_000 },
  );
}
