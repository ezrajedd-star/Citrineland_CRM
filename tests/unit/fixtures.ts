import type { PricingSettings, SchemeSnapshot } from "@/domain/pricing/computation";

export const settings: PricingSettings = {
  vat: { enabled: true, ratePct: 12, pricesIncludeVat: false, exemptThresholdCents: { CONDO: 360_000_000, HOUSE_AND_LOT: 360_000_000, LOT_ONLY: 191_950_000 }, parkingAlwaysVatable: true },
  miscFees: { pct: 7, includeInTcp: true },
  financingDefaults: { BANK: { ratePct: 7.5, termMonths: 240 }, PAGIBIG: { ratePct: 6.375, termMonths: 360 }, IN_HOUSE: { ratePct: 16, termMonths: 60 } },
};

export const base: Omit<SchemeSnapshot, "kind" | "name"> = {
  reservationFeeCents: 2_500_000,
  spotDiscountPct: 0,
  deferredMonths: null,
  dpPct: null,
  dpMonths: null,
  spotDpDiscountPct: 0,
  financing: null,
  interestRatePct: null,
  termMonths: null,
};

export const dpBank: SchemeSnapshot = { ...base, name: "20% DP 36mo bank", kind: "DP_BALANCE", dpPct: 20, dpMonths: 36, financing: "BANK", interestRatePct: 7.5, termMonths: 240 };
export const spotCash: SchemeSnapshot = { ...base, name: "Spot cash 8%", kind: "SPOT_CASH", spotDiscountPct: 8 };
export const deferred: SchemeSnapshot = { ...base, name: "Deferred 36", kind: "DEFERRED_CASH", deferredMonths: 36 };
export const spotDp: SchemeSnapshot = { ...base, name: "10% spot DP", kind: "DP_BALANCE", dpPct: 10, dpMonths: 0, spotDpDiscountPct: 5, financing: "BANK" };
export const inHouse: SchemeSnapshot = { ...base, name: "20% DP 12mo in-house", kind: "DP_BALANCE", dpPct: 20, dpMonths: 12, financing: "IN_HOUSE", interestRatePct: 16, termMonths: 60 };

export const condo5m = { kind: "UNIT" as const, code: "TA-1001", unitType: "CONDO" as const, listPriceCents: 500_000_000 };
