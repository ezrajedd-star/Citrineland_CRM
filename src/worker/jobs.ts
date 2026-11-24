/**
 * Job registry: name → handler, plus cron schedules (Asia/Manila).
 * Handlers must be idempotent: they may run more than once.
 */
import { prisma } from "@/lib/db";
import { SYSTEM_CTX } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { expireHolds, notifyHoldsNearingExpiry } from "@/server/holds";
import { applyDuePriceLists } from "@/server/price-lists";

export type JobHandler = (data: any) => Promise<unknown>;

export const JOBS: Record<string, { handler: JobHandler; cron?: string; description: string }> = {
  "worker.heartbeat": {
    cron: "* * * * *",
    description: "Records that the worker is alive (shown in Admin → system health)",
    handler: async () => prisma.setting.upsert({ where: { key: "worker.heartbeat" }, create: { key: "worker.heartbeat", value: { at: new Date().toISOString() } }, update: { value: { at: new Date().toISOString() } } }),
  },
  "holds.expire": {
    cron: "*/5 * * * *",
    description: "Auto-release expired unit holds and notify holders",
    handler: async () => expireHolds(),
  },
  "holds.near-expiry": {
    cron: "*/15 * * * *",
    description: "Warn holders when a hold is about to expire",
    handler: async () => notifyHoldsNearingExpiry((await getSettings()).holdNearExpiryHours),
  },
  "price-lists.apply": {
    cron: "5 0 * * *",
    description: "Apply future-dated price list versions on their effective date",
    handler: async () => applyDuePriceLists(SYSTEM_CTX),
  },
};
