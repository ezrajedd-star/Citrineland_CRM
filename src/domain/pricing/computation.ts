import { pctOf, pmt, splitEven, type Cents } from "@/lib/money";

/**
 * Sample computation (quote) math. Pure function: all tax/fee/rate inputs come from Settings,
 * never hardcoded here. All amounts are integer centavos.
 */

export type UnitType = "CONDO" | "HOUSE_AND_LOT" | "LOT_ONLY";
export type SchemeKind = "SPOT_CASH" | "DEFERRED_CASH" | "DP_BALANCE";
export type Financing = "BANK" | "PAGIBIG" | "IN_HOUSE";

export interface SchemeSnapshot {
  id?: string;
  name: string;
  kind: SchemeKind;
  reservationFeeCents: Cents;
  spotDiscountPct: number;
  deferredMonths: number | null;
  dpPct: number | null;
  dpMonths: number | null;
  spotDpDiscountPct: number;
  financing: Financing | null;
  interestRatePct: number | null;
  termMonths: number | null;
}

export interface PricingSettings {
  vat: {
    enabled: boolean;
    ratePct: number;
    pricesIncludeVat: boolean;
    exemptThresholdCents: Record<UnitType, number>;
    parkingAlwaysVatable: boolean;
  };
  miscFees: { pct: number; includeInTcp: boolean };
  financingDefaults: Record<Financing, { ratePct: number; termMonths: number }>;
}

export interface PricedItem {
  kind: "UNIT" | "PARKING";
  id?: string;
  code: string;
  unitType?: UnitType | null;
  listPriceCents: Cents;
}

export interface ComputationInput {
  items: PricedItem[];
  scheme: SchemeSnapshot;
  settings: PricingSettings;
  /** Promo discount as % of list price */
  discountPct?: number | null;
  /** Promo discount as fixed amount (after %) */
  discountAmountCents?: Cents | null;
}

export interface ItemLine {
  code: string;
  kind: "UNIT" | "PARKING";
  listPriceCents: Cents;
  discountCents: Cents;
  netPriceCents: Cents;
  vatable: boolean;
  vatCents: Cents;
}

export interface AmortizationEstimate {
  financing: Financing;
  ratePct: number;
  termMonths: number;
  monthlyCents: Cents;
  isSchemeFinancing: boolean;
}

export interface ComputationResult {
  schemeKind: SchemeKind;
  schemeName: string;
  lines: ItemLine[];
  listPriceCents: Cents;
  promoDiscountCents: Cents;
  spotCashDiscountCents: Cents;
  totalDiscountCents: Cents;
  netSellingPriceCents: Cents;
  vatRatePct: number;
  vatCents: Cents;
  vatIncludedInPrice: boolean;
  miscFeesPct: number;
  miscFeesCents: Cents;
  miscFeesInTcp: boolean;
  tcpCents: Cents;
  reservationFeeCents: Cents;
  /** SPOT_CASH: balance due after reservation fee */
  spotBalanceCents: Cents;
  /** DEFERRED_CASH */
  deferredMonths: number;
  deferredMonthlyCents: Cents;
  /** DP_BALANCE */
  dpPct: number;
  dpGrossCents: Cents;
  spotDpDiscountCents: Cents;
  /** DP still payable after deducting reservation fee and spot DP discount */
  dpNetPayableCents: Cents;
  dpMonths: number;
  dpMonthlyCents: Cents;
  balanceCents: Cents;
  financing: Financing | null;
  amortization: AmortizationEstimate[];
  /** What the buyer pays in total excluding financing interest (TCP minus spot DP discount) */
  totalPayableCents: Cents;
}

function allocateProportionally(total: Cents, weights: Cents[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let rem = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i = (i + 1) % out.length, rem--) out[i]++;
  return out;
}

export function computeSample(input: ComputationInput): ComputationResult {
  const { items, scheme, settings } = input;
  if (!items.length) throw new Error("At least one item is required");
  const listPrice = items.reduce((a, i) => a + i.listPriceCents, 0);

  // 1) Discounts: promo % then promo amount, then spot cash discount on the promo-discounted price
  const promoPct = pctOf(listPrice, input.discountPct ?? 0);
  const promo = Math.min(listPrice, promoPct + (input.discountAmountCents ?? 0));
  const spotCash = scheme.kind === "SPOT_CASH" ? pctOf(listPrice - promo, scheme.spotDiscountPct) : 0;
  const totalDiscount = promo + spotCash;
  const itemDiscounts = allocateProportionally(
    totalDiscount,
    items.map((i) => i.listPriceCents),
  );

  // 2) Net selling price and VAT per item (residential exemption thresholds per unit type)
  const r = settings.vat.ratePct;
  const lines: ItemLine[] = items.map((i, idx) => {
    const net = i.listPriceCents - itemDiscounts[idx];
    let vatable = false;
    if (settings.vat.enabled) {
      if (i.kind === "PARKING") vatable = settings.vat.parkingAlwaysVatable || net > settings.vat.exemptThresholdCents.CONDO;
      else vatable = net > settings.vat.exemptThresholdCents[(i.unitType ?? "CONDO") as UnitType];
    }
    const vat = !vatable ? 0 : settings.vat.pricesIncludeVat ? Math.round((net * r) / (100 + r)) : pctOf(net, r);
    return { code: i.code, kind: i.kind, listPriceCents: i.listPriceCents, discountCents: itemDiscounts[idx], netPriceCents: net, vatable, vatCents: vat };
  });
  const nsp = lines.reduce((a, l) => a + l.netPriceCents, 0);
  const vat = lines.reduce((a, l) => a + l.vatCents, 0);
  const vatAdded = settings.vat.pricesIncludeVat ? 0 : vat;

  // 3) Miscellaneous fees and Total Contract Price
  const misc = pctOf(nsp, settings.miscFees.pct);
  const tcp = nsp + vatAdded + (settings.miscFees.includeInTcp ? misc : 0);
  const rf = Math.min(scheme.reservationFeeCents, tcp);

  // 4) Scheme-specific payment structure
  let spotBalance = 0;
  let deferredMonths = 0;
  let deferredMonthly = 0;
  let dpPct = 0;
  let dpGross = 0;
  let spotDpDiscount = 0;
  let dpNet = 0;
  let dpMonths = 0;
  let dpMonthly = 0;
  let balance = 0;

  if (scheme.kind === "SPOT_CASH") {
    spotBalance = tcp - rf;
  } else if (scheme.kind === "DEFERRED_CASH") {
    deferredMonths = Math.max(1, scheme.deferredMonths ?? 1);
    deferredMonthly = splitEven(tcp - rf, deferredMonths)[0];
  } else {
    dpPct = scheme.dpPct ?? 0;
    dpMonths = Math.max(0, scheme.dpMonths ?? 0);
    dpGross = pctOf(tcp, dpPct);
    spotDpDiscount = dpMonths === 0 ? pctOf(dpGross, scheme.spotDpDiscountPct) : 0;
    const afterRf = dpGross - rf - spotDpDiscount;
    dpNet = Math.max(0, afterRf);
    balance = tcp - dpGross - Math.max(0, -afterRf); // excess reservation fee reduces the balance
    dpMonthly = dpMonths > 0 ? splitEven(dpNet, dpMonths)[0] : dpNet;
  }

  // 5) Indicative amortization for bank / Pag-IBIG / in-house at configured rates
  const amortization: AmortizationEstimate[] = [];
  if (scheme.kind === "DP_BALANCE" && balance > 0) {
    for (const f of ["BANK", "PAGIBIG", "IN_HOUSE"] as Financing[]) {
      const isScheme = scheme.financing === f;
      const ratePct = isScheme && scheme.interestRatePct != null ? scheme.interestRatePct : settings.financingDefaults[f].ratePct;
      const termMonths = isScheme && scheme.termMonths ? scheme.termMonths : settings.financingDefaults[f].termMonths;
      amortization.push({ financing: f, ratePct, termMonths, monthlyCents: pmt(balance, ratePct, termMonths), isSchemeFinancing: isScheme });
    }
  }

  return {
    schemeKind: scheme.kind,
    schemeName: scheme.name,
    lines,
    listPriceCents: listPrice,
    promoDiscountCents: promo,
    spotCashDiscountCents: spotCash,
    totalDiscountCents: totalDiscount,
    netSellingPriceCents: nsp,
    vatRatePct: r,
    vatCents: vat,
    vatIncludedInPrice: settings.vat.pricesIncludeVat,
    miscFeesPct: settings.miscFees.pct,
    miscFeesCents: misc,
    miscFeesInTcp: settings.miscFees.includeInTcp,
    tcpCents: tcp,
    reservationFeeCents: rf,
    spotBalanceCents: spotBalance,
    deferredMonths,
    deferredMonthlyCents: deferredMonthly,
    dpPct,
    dpGrossCents: dpGross,
    spotDpDiscountCents: spotDpDiscount,
    dpNetPayableCents: dpNet,
    dpMonths,
    dpMonthlyCents: dpMonthly,
    balanceCents: balance,
    financing: scheme.kind === "DP_BALANCE" ? scheme.financing : null,
    amortization,
    totalPayableCents: tcp - spotDpDiscount,
  };
}
