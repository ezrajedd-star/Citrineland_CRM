import { InvalidTransitionError } from "../errors";

export const INVENTORY_STATUSES = ["AVAILABLE", "ON_HOLD", "RESERVED", "SOLD", "BLOCKED"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/**
 * Events that move a unit/parking slot through its lifecycle:
 *   AVAILABLE → ON_HOLD → RESERVED → SOLD, plus BLOCKED, and back to AVAILABLE on hold expiry or cancellation.
 */
export type InventoryEvent =
  | "HOLD" // place a time-limited hold
  | "RELEASE_HOLD" // holder/manager releases hold
  | "EXPIRE_HOLD" // worker auto-release
  | "RESERVE" // reservation created (from AVAILABLE or from the holder's hold)
  | "MARK_SOLD" // contract to sell signed
  | "CANCEL" // transaction cancelled → back to AVAILABLE
  | "TRANSFER_OUT" // item swapped out of a transaction → AVAILABLE
  | "BLOCK" // management hold / not for sale
  | "UNBLOCK";

const TABLE: Record<InventoryStatus, Partial<Record<InventoryEvent, InventoryStatus>>> = {
  AVAILABLE: { HOLD: "ON_HOLD", RESERVE: "RESERVED", BLOCK: "BLOCKED" },
  ON_HOLD: { RELEASE_HOLD: "AVAILABLE", EXPIRE_HOLD: "AVAILABLE", RESERVE: "RESERVED" },
  RESERVED: { MARK_SOLD: "SOLD", CANCEL: "AVAILABLE", TRANSFER_OUT: "AVAILABLE" },
  SOLD: { CANCEL: "AVAILABLE", TRANSFER_OUT: "AVAILABLE" },
  BLOCKED: { UNBLOCK: "AVAILABLE" },
};

export function nextInventoryStatus(current: InventoryStatus, event: InventoryEvent): InventoryStatus {
  const next = TABLE[current]?.[event];
  if (!next) throw new InvalidTransitionError("inventory status", current, eventLabel(event));
  return next;
}

export function canApply(current: InventoryStatus, event: InventoryEvent): boolean {
  return Boolean(TABLE[current]?.[event]);
}

export function allowedEvents(current: InventoryStatus): InventoryEvent[] {
  return Object.keys(TABLE[current] ?? {}) as InventoryEvent[];
}

function eventLabel(e: InventoryEvent): string {
  return (
    {
      HOLD: "ON_HOLD",
      RELEASE_HOLD: "AVAILABLE (release)",
      EXPIRE_HOLD: "AVAILABLE (expiry)",
      RESERVE: "RESERVED",
      MARK_SOLD: "SOLD",
      CANCEL: "AVAILABLE (cancellation)",
      TRANSFER_OUT: "AVAILABLE (transfer)",
      BLOCK: "BLOCKED",
      UNBLOCK: "AVAILABLE (unblock)",
    } as const
  )[e];
}
