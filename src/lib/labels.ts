import { titleCase } from "./utils";

const OVERRIDES: Record<string, string> = {
  CONDO: "Condo",
  HOUSE_AND_LOT: "House & Lot",
  LOT_ONLY: "Lot only",
  RFO: "RFO",
  PRE_SELLING: "Pre-selling",
  PAGIBIG: "Pag-IBIG",
  IN_HOUSE: "In-house",
  DP_BALANCE: "DP + Balance",
  SPOT_CASH: "Spot cash",
  DEFERRED_CASH: "Deferred cash",
  PWD: "PWD",
  EV: "EV",
  NSP: "Net selling price",
  TCP: "Total contract price",
  CONTRACT_SIGNED: "Contract signed (CTS)",
  DOWNPAYMENT_IN_PROGRESS: "DP in progress",
  DOWNPAYMENT_COMPLETE: "DP complete",
  FOR_LOAN_TAKEOUT: "For loan takeout",
  BALANCE_IN_PROGRESS: "Balance in progress",
  SITE_VISIT: "Site visit / tripping",
  EMAIL_IN: "Email received",
  EMAIL_OUT: "Email sent",
  BNG: "BNG",
  ATTORNEY_IN_FACT: "Attorney-in-fact",
  CO_BUYER: "Co-buyer",
};

export function label(v: string | null | undefined): string {
  if (!v) return "—";
  return OVERRIDES[v] ?? titleCase(v);
}

export function options(values: readonly string[]) {
  return values.map((v) => ({ value: v, label: label(v) }));
}
