import type { Tx } from "@/lib/db";
import type { ActorCtx } from "@/lib/audit";

// Implemented in Phase 5.
export async function createLedgerForTransaction(_tx: Tx, _transactionId: string, _ctx: ActorCtx) {}
export async function evaluateTranches(_tx: Tx, _transactionId: string, _ctx: ActorCtx): Promise<string[]> {
  return [];
}
export async function forfeitUnreleased(_tx: Tx, _transactionId: string, _ctx: ActorCtx) {}
