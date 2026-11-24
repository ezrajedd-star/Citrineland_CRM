import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ActorCtx } from "@/lib/audit";
import { recordPayment } from "./transactions";

export const PAYMENT_IMPORT_COLUMNS = ["transaction_code", "paid_at", "amount", "or_number", "method", "reference", "external_id"] as const;

const rowSchema = z.object({
  transaction_code: z.string().trim().min(1, "transaction_code is required"),
  paid_at: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "paid_at must be YYYY-MM-DD"),
  amount: z.preprocess((v) => Number(String(v ?? "").replace(/[₱,\s]/g, "")), z.number().positive("amount must be > 0")),
  or_number: z.string().trim().optional().default(""),
  method: z.preprocess((v) => String(v || "BANK_TRANSFER").trim().toUpperCase().replace(/\s+/g, "_"), z.enum(["CASH", "CHECK", "PDC", "BANK_TRANSFER", "ONLINE", "CREDIT_CARD", "LOAN_PROCEEDS", "OTHER"])),
  reference: z.string().trim().optional().default(""),
  external_id: z.string().trim().optional().default(""),
});

export interface PaymentPreviewRow {
  line: number;
  raw: Record<string, string>;
  ok: boolean;
  errors: string[];
  transactionId?: string;
}

export function parsePaymentCsv(text: string) {
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") }).data;
}

export async function previewPaymentImport(rows: Record<string, string>[]): Promise<PaymentPreviewRow[]> {
  const codes = [...new Set(rows.map((r) => (r.transaction_code ?? "").trim()))];
  const txs = await prisma.transaction.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, status: true } });
  const byCode = new Map(txs.map((t) => [t.code, t]));
  const exts = rows.map((r) => r.external_id).filter(Boolean);
  const ors = rows.map((r) => r.or_number).filter(Boolean);
  const [existingExt, existingOr] = await Promise.all([
    prisma.payment.findMany({ where: { source: "CSV", externalId: { in: exts } }, select: { externalId: true } }),
    prisma.payment.findMany({ where: { orNumber: { in: ors }, voidedAt: null }, select: { orNumber: true } }),
  ]);
  const extSet = new Set(existingExt.map((e) => e.externalId));
  const orSet = new Set(existingOr.map((e) => e.orNumber));
  return rows.map((raw, i) => {
    const errors: string[] = [];
    const p = rowSchema.safeParse(raw);
    if (!p.success) errors.push(...p.error.issues.map((x) => x.message));
    const t = byCode.get((raw.transaction_code ?? "").trim());
    if (!t) errors.push(`transaction ${raw.transaction_code} not found`);
    else if (t.status === "CANCELLED" || t.status === "TRANSFERRED") errors.push(`transaction is ${t.status.toLowerCase()}`);
    if (raw.external_id && extSet.has(raw.external_id)) errors.push("already imported (external_id)");
    if (raw.or_number && orSet.has(raw.or_number)) errors.push(`OR ${raw.or_number} already recorded`);
    return { line: i + 2, raw, ok: errors.length === 0, errors, transactionId: t?.id };
  });
}

export async function commitPaymentImport(rows: Record<string, string>[], ctx: ActorCtx) {
  const preview = await previewPaymentImport(rows);
  let imported = 0;
  const failed: { line: number; error: string }[] = [];
  for (const r of preview) {
    if (!r.ok) {
      failed.push({ line: r.line, error: r.errors.join("; ") });
      continue;
    }
    const d = rowSchema.parse(r.raw);
    try {
      await recordPayment(
        {
          transactionId: r.transactionId!,
          paidAt: new Date(`${d.paid_at}T00:00:00.000Z`),
          amountCents: Math.round(d.amount * 100),
          orNumber: d.or_number || null,
          method: d.method,
          reference: d.reference || null,
          source: "CSV",
          externalId: d.external_id || `csv:${d.transaction_code}:${d.paid_at}:${d.or_number || d.amount}`,
          notes: "Imported from CSV",
        },
        ctx,
      );
      imported++;
    } catch (e) {
      failed.push({ line: r.line, error: (e as Error).message });
    }
  }
  return { imported, failed };
}
