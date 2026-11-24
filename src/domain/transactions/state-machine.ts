import { InvalidTransitionError } from "../errors";

export const TX_STATUSES = [
  "RESERVED",
  "DOCUMENTATION",
  "CONTRACT_SIGNED",
  "DOWNPAYMENT_IN_PROGRESS",
  "DOWNPAYMENT_COMPLETE",
  "FOR_LOAN_TAKEOUT",
  "BALANCE_IN_PROGRESS",
  "FULLY_PAID",
  "TURNED_OVER",
  "TITLED",
  "CANCELLED",
  "TRANSFERRED",
] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

/** Forward lifecycle. CANCELLED and TRANSFERRED are side exits handled by dedicated actions. */
const FORWARD: Record<TxStatus, TxStatus[]> = {
  RESERVED: ["DOCUMENTATION"],
  DOCUMENTATION: ["CONTRACT_SIGNED"],
  // Spot cash may go straight to fully paid; deferred cash to balance in progress
  CONTRACT_SIGNED: ["DOWNPAYMENT_IN_PROGRESS", "BALANCE_IN_PROGRESS", "FULLY_PAID"],
  DOWNPAYMENT_IN_PROGRESS: ["DOWNPAYMENT_COMPLETE"],
  DOWNPAYMENT_COMPLETE: ["FOR_LOAN_TAKEOUT", "BALANCE_IN_PROGRESS", "FULLY_PAID"],
  FOR_LOAN_TAKEOUT: ["FULLY_PAID", "TURNED_OVER"],
  BALANCE_IN_PROGRESS: ["FULLY_PAID", "TURNED_OVER"],
  FULLY_PAID: ["TURNED_OVER", "TITLED"],
  TURNED_OVER: ["TITLED", "FULLY_PAID"],
  TITLED: [],
  CANCELLED: [],
  TRANSFERRED: [],
};

export const TERMINAL: TxStatus[] = ["TITLED", "CANCELLED", "TRANSFERRED"];
/** Statuses where the buyer holds the inventory (used for parking eligibility, reports) */
export const ACTIVE_TX_STATUSES: TxStatus[] = TX_STATUSES.filter((s) => s !== "CANCELLED" && s !== "TRANSFERRED");

export function allowedNextStatuses(from: TxStatus): TxStatus[] {
  return FORWARD[from] ?? [];
}

export function canCancel(from: TxStatus): boolean {
  return !TERMINAL.includes(from);
}

export function canTransfer(from: TxStatus): boolean {
  return !TERMINAL.includes(from) && from !== "TURNED_OVER";
}

export function assertTransition(from: TxStatus, to: TxStatus): void {
  if (to === "CANCELLED") {
    if (!canCancel(from)) throw new InvalidTransitionError("transaction", from, to);
    return;
  }
  if (to === "TRANSFERRED") {
    if (!canTransfer(from)) throw new InvalidTransitionError("transaction", from, to);
    return;
  }
  if (!FORWARD[from]?.includes(to)) throw new InvalidTransitionError("transaction", from, to);
}

/** Date field stamped when entering a status */
export const STATUS_DATE_FIELD: Partial<Record<TxStatus, string>> = {
  CONTRACT_SIGNED: "contractSignedAt",
  DOWNPAYMENT_COMPLETE: "dpCompletedAt",
  FULLY_PAID: "fullyPaidAt",
  TURNED_OVER: "turnedOverAt",
  TITLED: "titledAt",
  CANCELLED: "cancelledAt",
};
