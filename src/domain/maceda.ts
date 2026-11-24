import { pctOf, type Cents } from "@/lib/money";

/**
 * RA 6552 (Maceda Law) indicative computation on cancellation of an installment sale of residential real estate.
 * This is for legal/finance review only — not a final figure.
 *
 * - ≥ 2 years of installments paid: cash surrender value = 50% of total payments made, +5% per year after the 5th
 *   year, capped at 90%. Grace period: one month for every year of installments paid.
 * - < 2 years: no cash surrender value; grace period of 60 days from the due date.
 */
export interface MacedaInput {
  /** Total payments made (reservation fee, down payment and installments) */
  totalPaidCents: Cents;
  /** Number of monthly installments paid */
  installmentMonthsPaid: number;
  /** Whether the sale is on installment (spot cash / fully bank-financed purchases are not covered) */
  isInstallmentSale: boolean;
}

export interface MacedaResult {
  applicable: boolean;
  yearsPaid: number;
  qualifiesForRefund: boolean;
  cashSurrenderPct: number;
  cashSurrenderValueCents: Cents;
  gracePeriod: { months: number; days: number };
  basis: string;
  notes: string[];
}

export const MACEDA_DISCLAIMER = "Indicative computation under RA 6552 (Maceda Law) for legal/finance review. Not a final refund figure.";

export function computeMaceda(input: MacedaInput): MacedaResult {
  const years = Math.floor(Math.max(0, input.installmentMonthsPaid) / 12);
  if (!input.isInstallmentSale) {
    return {
      applicable: false,
      yearsPaid: years,
      qualifiesForRefund: false,
      cashSurrenderPct: 0,
      cashSurrenderValueCents: 0,
      gracePeriod: { months: 0, days: 0 },
      basis: "RA 6552 covers sales on installment; this transaction is not an installment sale.",
      notes: ["Refer to the Contract to Sell for cancellation terms."],
    };
  }
  if (years >= 2) {
    const pct = Math.min(90, 50 + 5 * Math.max(0, years - 5));
    return {
      applicable: true,
      yearsPaid: years,
      qualifiesForRefund: true,
      cashSurrenderPct: pct,
      cashSurrenderValueCents: pctOf(input.totalPaidCents, pct),
      gracePeriod: { months: years, days: 0 },
      basis: `Buyer paid at least two years of installments (${years} year${years === 1 ? "" : "s"}): ${pct}% of total payments.`,
      notes: [
        `Grace period: ${years} month(s) to pay installments due without interest (exercisable once every five years).`,
        "Cancellation takes effect 30 days after the buyer receives a notarial notice of cancellation and upon full payment of the cash surrender value.",
        "Down payments, deposits and installments are included in total payments.",
      ],
    };
  }
  return {
    applicable: true,
    yearsPaid: years,
    qualifiesForRefund: false,
    cashSurrenderPct: 0,
    cashSurrenderValueCents: 0,
    gracePeriod: { months: 0, days: 60 },
    basis: "Buyer paid less than two years of installments: no cash surrender value.",
    notes: ["Grace period of 60 days from the date the installment became due.", "If unpaid after the grace period, the seller may cancel 30 days after the buyer receives a notarial notice of cancellation."],
  };
}
