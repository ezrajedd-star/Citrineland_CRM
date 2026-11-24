import { z } from "zod";
import { prisma } from "./db";

/**
 * Typed application settings stored in the `Setting` table (key → JSON).
 * Defaults live here; values that change over time (VAT, fees, rates) must be configured, never hardcoded elsewhere.
 */
export const settingsSchema = z.object({
  holdDurationHours: z.coerce.number().int().min(1).max(720),
  holdNearExpiryHours: z.coerce.number().int().min(1).max(72),
  parkingRequiresUnitOwnership: z.boolean(),
  passwordLoginEnabled: z.boolean(),
  /** Tax treatment (confirm with Citrineland's tax adviser) */
  vat: z.object({
    enabled: z.boolean(),
    ratePct: z.coerce.number().min(0).max(100),
    /** If true, list prices already include VAT and VAT is only shown for information */
    pricesIncludeVat: z.boolean(),
    /** Residential sales at or below these net selling prices are VAT-exempt (centavos) */
    exemptThresholdCents: z.object({
      CONDO: z.coerce.number().int().min(0),
      HOUSE_AND_LOT: z.coerce.number().int().min(0),
      LOT_ONLY: z.coerce.number().int().min(0),
    }),
    /** Parking slots sold are treated as VATable regardless of threshold */
    parkingAlwaysVatable: z.boolean(),
  }),
  miscFees: z.object({
    /** Miscellaneous/other charges as % of net selling price (transfer taxes, registration, utilities hook-up) */
    pct: z.coerce.number().min(0).max(100),
    includeInTcp: z.boolean(),
  }),
  financingDefaults: z.object({
    BANK: z.object({ ratePct: z.coerce.number().min(0), termMonths: z.coerce.number().int().min(1) }),
    PAGIBIG: z.object({ ratePct: z.coerce.number().min(0), termMonths: z.coerce.number().int().min(1) }),
    IN_HOUSE: z.object({ ratePct: z.coerce.number().min(0), termMonths: z.coerce.number().int().min(1) }),
  }),
  computationValidityDays: z.coerce.number().int().min(1).max(180),
  computationDisclaimer: z.string(),
  spotCashDueDays: z.coerce.number().int().min(0).max(180),
  defaultCommissionPct: z.coerce.number().min(0).max(100),
  defaultReservationFeeCents: z.coerce.number().int().min(0),
  email: z.object({
    storeFullBodies: z.boolean(),
    internalDomains: z.array(z.string()),
    captureEnabled: z.boolean(),
  }),
  webForm: z.object({
    enabled: z.boolean(),
    allowedOrigins: z.array(z.string()),
    defaultSourceCode: z.string(),
    successMessage: z.string(),
    rateLimitPerHour: z.coerce.number().int().min(1),
  }),
  stalledLeadDays: z.coerce.number().int().min(1),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  holdDurationHours: 48,
  holdNearExpiryHours: 6,
  parkingRequiresUnitOwnership: true,
  passwordLoginEnabled: true,
  vat: {
    enabled: true,
    ratePct: 12,
    pricesIncludeVat: false,
    // Placeholder thresholds — Citrineland's tax adviser must confirm current BIR values.
    exemptThresholdCents: { CONDO: 360_000_000, HOUSE_AND_LOT: 360_000_000, LOT_ONLY: 191_950_000 },
    parkingAlwaysVatable: true,
  },
  miscFees: { pct: 7, includeInTcp: true },
  financingDefaults: {
    BANK: { ratePct: 7.5, termMonths: 240 },
    PAGIBIG: { ratePct: 6.375, termMonths: 360 },
    IN_HOUSE: { ratePct: 16, termMonths: 60 },
  },
  computationValidityDays: 7,
  computationDisclaimer:
    "This is a sample computation for reference only. Prices, promos, taxes and fees are subject to change without prior notice and are valid only until the date shown. Final figures will be reflected in the Reservation Agreement and Contract to Sell. Loan amortizations are estimates and subject to lender approval.",
  spotCashDueDays: 30,
  defaultCommissionPct: 5,
  defaultReservationFeeCents: 2_500_000,
  email: { storeFullBodies: false, internalDomains: ["citrineland.test"], captureEnabled: true },
  webForm: {
    enabled: true,
    allowedOrigins: [],
    defaultSourceCode: "WEBSITE",
    successMessage: "Thank you! A Citrineland property specialist will contact you shortly.",
    rateLimitPerHour: 10,
  },
  stalledLeadDays: 7,
};

const KEY = "app";

function deepMerge<T>(base: T, over: any): T {
  if (over === null || over === undefined) return base;
  if (Array.isArray(base) || typeof base !== "object" || base === null) return (over ?? base) as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = k in (base as any) ? deepMerge((base as any)[k], over[k]) : over[k];
  return out;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const merged = deepMerge(DEFAULT_SETTINGS, row?.value ?? {});
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(value: AppSettings, userId: string) {
  const parsed = settingsSchema.parse(value);
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: parsed as any, updatedById: userId },
    update: { value: parsed as any, updatedById: userId },
  });
  return parsed;
}
