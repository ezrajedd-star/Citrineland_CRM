/**
 * Job registry: name → handler, plus cron schedules (Asia/Manila).
 * Handlers must be idempotent: they may run more than once.
 */
import { prisma } from "@/lib/db";
import { SYSTEM_CTX } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { expireHolds, notifyHoldsNearingExpiry } from "@/server/holds";
import { applyDuePriceLists } from "@/server/price-lists";
import { syncAllMailboxes, syncAllCalendars, emailPendingNotifications } from "@/server/graph/sync";
import { graphConfigured } from "@/server/graph/client";
import { dispatch, scanInactiveLeads, scanOverdueDocuments, scanPaymentReminders, scanBrokerExpiry } from "@/server/automation/engine";
import { runDueSequences } from "@/server/sequences";

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
  "automation.dispatch": {
    description: "Run built-in automations and custom rules for a domain event",
    handler: async (event) => dispatch(event),
  },
  "automation.lead-inactivity": {
    cron: "0 8 * * *",
    description: "Follow-up tasks for leads without activity (built-in automation)",
    handler: async () => scanInactiveLeads(),
  },
  "automation.documents-overdue": {
    cron: "15 * * * *",
    description: "Tasks + notifications for overdue documentation items",
    handler: async () => scanOverdueDocuments(),
  },
  "automation.payment-reminders": {
    cron: "30 7 * * *",
    description: "Internal tasks for payments due in N days and overdue payments",
    handler: async () => scanPaymentReminders(),
  },
  "automation.broker-expiry": {
    cron: "45 7 * * *",
    description: "PRC license / accreditation expiry notices (60/30/7 days) and auto-EXPIRED",
    handler: async () => scanBrokerExpiry(),
  },
  "sequences.run": {
    cron: "*/10 * * * *",
    description: "Send due email-sequence steps from the lead owner's Outlook",
    handler: async () => (graphConfigured() ? runDueSequences() : 0),
  },
  "graph.mail-sync": {
    cron: "*/5 * * * *",
    description: "Capture Outlook emails with known leads/clients/brokers onto timelines",
    handler: async () => (graphConfigured() ? syncAllMailboxes() : 0),
  },
  "graph.calendar-sync": {
    cron: "*/15 * * * *",
    description: "Log Outlook meetings with known contacts as activities",
    handler: async () => (graphConfigured() ? syncAllCalendars() : 0),
  },
  "notifications.email": {
    cron: "*/5 * * * *",
    description: "Email in-app notifications to users who opted in (via their own Outlook)",
    handler: async () => (graphConfigured() ? emailPendingNotifications() : 0),
  },
};
