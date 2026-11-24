import { enqueue } from "@/worker/boss";

/**
 * Domain events consumed by the automation engine (worker job "automation.dispatch").
 * Emitting is fire-and-forget: business operations never fail because the queue is down.
 */
export type DomainEvent =
  | { type: "lead.created"; leadId: string; actorId: string | null }
  | { type: "lead.stage_changed"; leadId: string; fromStageId: string | null; toStageId: string; actorId: string | null }
  | { type: "transaction.reserved"; transactionId: string; actorId: string | null }
  | { type: "transaction.status_changed"; transactionId: string; from: string; to: string; actorId: string | null }
  | { type: "payment.recorded"; transactionId: string; paymentId: string; actorId: string | null }
  | { type: "email.received"; leadId: string; actorId: null };

export async function emit(event: DomainEvent) {
  if (process.env.DISABLE_EVENTS === "true") return;
  await enqueue("automation.dispatch", event, { retryLimit: 3, retryDelay: 30 });
}
