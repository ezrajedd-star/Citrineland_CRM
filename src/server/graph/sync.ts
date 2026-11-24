import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";
import { graphFor, markGraphError } from "./client";
import { logActivity } from "../activities";
import { emit } from "../events";

type Contact = { kind: "lead" | "client" | "broker"; id: string; email: string };

/** Map of lower-cased email → known contacts (leads, clients, brokers) */
async function contactsByEmail(emails: string[]): Promise<Map<string, Contact[]>> {
  const uniq = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (!uniq.length) return new Map();
  const [leads, clients, brokers] = await Promise.all([
    prisma.lead.findMany({ where: { deletedAt: null, email: { in: uniq, mode: "insensitive" } }, select: { id: true, email: true } }),
    prisma.client.findMany({ where: { deletedAt: null, anonymizedAt: null, email: { in: uniq, mode: "insensitive" } }, select: { id: true, email: true } }),
    prisma.broker.findMany({ where: { deletedAt: null, email: { in: uniq, mode: "insensitive" } }, select: { id: true, email: true } }),
  ]);
  const m = new Map<string, Contact[]>();
  const add = (c: Contact) => m.set(c.email.toLowerCase(), [...(m.get(c.email.toLowerCase()) ?? []), c]);
  leads.forEach((l) => add({ kind: "lead", id: l.id, email: l.email! }));
  clients.forEach((l) => add({ kind: "client", id: l.id, email: l.email! }));
  brokers.forEach((l) => add({ kind: "broker", id: l.id, email: l.email! }));
  return m;
}

const isInternal = (email: string, domains: string[]) => domains.some((d) => email.toLowerCase().endsWith("@" + d.toLowerCase()));

/**
 * Poll one mailbox for messages since the last sync and log those to/from known leads, clients or brokers.
 * Internal-only emails are ignored. Only subject, snippet, participants, timestamp and an Outlook link are stored
 * unless Settings → email.storeFullBodies is on.
 */
export async function syncMailbox(userId: string) {
  const settings = await getSettings();
  if (!settings.email.captureEnabled) return { logged: 0 };
  const conn = await prisma.microsoftConnection.findUnique({ where: { userId }, include: { user: true } });
  if (!conn || conn.status === "DISCONNECTED") return { logged: 0 };
  const since = conn.lastMailSyncAt ?? new Date(Date.now() - 7 * 86_400_000);
  const startedAt = new Date();
  const client = graphFor(userId);
  const select = ["id", "internetMessageId", "subject", "bodyPreview", "from", "toRecipients", "ccRecipients", "receivedDateTime", "sentDateTime", "webLink", "conversationId", "isDraft"];
  if (settings.email.storeFullBodies) select.push("body");
  let url: string | null = `/me/messages?$filter=lastModifiedDateTime ge ${since.toISOString()}&$select=${select.join(",")}&$top=50&$orderby=lastModifiedDateTime asc`;
  let logged = 0;
  let pages = 0;
  const me = (conn.email ?? conn.user.email).toLowerCase();
  try {
    while (url && pages < 10) {
      const res: any = await client.api(url).header("Prefer", 'outlook.body-content-type="text"').get();
      pages++;
      const msgs: any[] = res.value ?? [];
      const all = msgs.flatMap((m) => [m.from?.emailAddress?.address, ...(m.toRecipients ?? []).map((r: any) => r.emailAddress?.address), ...(m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address)]).filter(Boolean);
      const known = await contactsByEmail(all);
      for (const m of msgs) {
        if (m.isDraft) continue;
        const from = String(m.from?.emailAddress?.address ?? "").toLowerCase();
        const to = (m.toRecipients ?? []).map((r: any) => String(r.emailAddress?.address ?? "").toLowerCase());
        const cc = (m.ccRecipients ?? []).map((r: any) => String(r.emailAddress?.address ?? "").toLowerCase());
        const participants = [from, ...to, ...cc].filter(Boolean);
        if (participants.every((p) => isInternal(p, settings.email.internalDomains))) continue;
        const outbound = from === me;
        const matches = participants.filter((p) => p !== me).flatMap((p) => known.get(p) ?? []);
        if (!matches.length) continue;
        const imid = m.internetMessageId ?? m.id;
        for (const c of matches) {
          const key = `mail:${imid}:${c.kind}:${c.id}`;
          if (await prisma.activity.findUnique({ where: { externalKey: key } })) continue;
          await logActivity({
            type: outbound ? "EMAIL_OUT" : "EMAIL_IN",
            subject: m.subject || "(no subject)",
            body: settings.email.storeFullBodies ? String(m.body?.content ?? "").slice(0, 20_000) : String(m.bodyPreview ?? "").slice(0, 255),
            occurredAt: new Date(outbound ? (m.sentDateTime ?? m.receivedDateTime) : m.receivedDateTime),
            actorId: userId,
            leadId: c.kind === "lead" ? c.id : null,
            clientId: c.kind === "client" ? c.id : null,
            brokerId: c.kind === "broker" ? c.id : null,
            externalKey: key,
            meta: { participants: `From: ${from} · To: ${to.join(", ")}${cc.length ? ` · Cc: ${cc.join(", ")}` : ""}`, webLink: m.webLink, conversationId: m.conversationId, mailbox: me, captured: true },
          });
          logged++;
          // Reply detection for email sequences
          if (!outbound && c.kind === "lead" && c.email.toLowerCase() === from) await emit({ type: "email.received", leadId: c.id, actorId: null });
        }
      }
      url = res["@odata.nextLink"] ?? null;
    }
    await prisma.microsoftConnection.update({ where: { userId }, data: { lastMailSyncAt: startedAt, status: "CONNECTED", lastError: null } });
  } catch (e) {
    await markGraphError(userId, e);
    logger.warn({ userId, err: (e as Error).message }, "mail sync failed");
  }
  return { logged };
}

/** Log Outlook calendar events that include a known contact (events created from the CRM are skipped). */
export async function syncCalendar(userId: string) {
  const conn = await prisma.microsoftConnection.findUnique({ where: { userId }, include: { user: true } });
  if (!conn || conn.status === "DISCONNECTED") return { logged: 0 };
  const start = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
  let logged = 0;
  try {
    const res: any = await graphFor(userId).api(`/me/calendarView?startDateTime=${start}&endDateTime=${end}&$select=id,subject,start,end,attendees,organizer,webLink,location,categories,isCancelled&$top=100`).get();
    const events: any[] = res.value ?? [];
    const emails = events.flatMap((e) => (e.attendees ?? []).map((a: any) => a.emailAddress?.address)).filter(Boolean);
    const known = await contactsByEmail(emails);
    for (const ev of events) {
      if (ev.isCancelled) continue;
      if (await prisma.activity.findFirst({ where: { externalKey: { startsWith: `event:${ev.id}` } } })) continue; // created from CRM or already logged
      const contacts = (ev.attendees ?? []).flatMap((a: any) => known.get(String(a.emailAddress?.address ?? "").toLowerCase()) ?? []);
      for (const c of contacts as Contact[]) {
        await logActivity({
          type: "MEETING",
          subject: ev.subject || "Meeting",
          occurredAt: new Date(ev.start.dateTime + (ev.start.timeZone === "UTC" ? "Z" : "")),
          actorId: userId,
          leadId: c.kind === "lead" ? c.id : null,
          clientId: c.kind === "client" ? c.id : null,
          brokerId: c.kind === "broker" ? c.id : null,
          externalKey: `event:${ev.id}:${c.kind}:${c.id}`,
          meta: { outlookLink: ev.webLink, location: ev.location?.displayName, endsAt: ev.end?.dateTime, organizer: ev.organizer?.emailAddress?.address, fromOutlook: true },
        });
        logged++;
      }
    }
    await prisma.microsoftConnection.update({ where: { userId }, data: { lastCalendarSyncAt: new Date() } });
  } catch (e) {
    await markGraphError(userId, e);
  }
  return { logged };
}

export async function syncAllMailboxes() {
  const conns = await prisma.microsoftConnection.findMany({ where: { status: { in: ["CONNECTED", "ERROR"] }, user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true } });
  let logged = 0;
  for (const c of conns) logged += (await syncMailbox(c.userId)).logged;
  return logged;
}

export async function syncAllCalendars() {
  const conns = await prisma.microsoftConnection.findMany({ where: { status: "CONNECTED", user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true } });
  let logged = 0;
  for (const c of conns) logged += (await syncCalendar(c.userId)).logged;
  return logged;
}

/** Email in-app notifications to users who opted in — sent from their own mailbox to themselves (delegated Mail.Send). */
export async function emailPendingNotifications() {
  const pending = await prisma.notification.findMany({
    where: { emailedAt: null, readAt: null, createdAt: { gte: new Date(Date.now() - 86_400_000) }, user: { emailNotifications: true, status: "ACTIVE", microsoftConnection: { status: "CONNECTED" } } },
    include: { user: true },
    take: 200,
  });
  const { sendMailAs } = await import("./mail");
  let sent = 0;
  for (const n of pending) {
    const link = n.link ? `${process.env.APP_URL ?? ""}${n.link}` : null;
    const r = await sendMailAs(n.userId, { to: [n.user.email], subject: `[Citrineland CRM] ${n.title}`, html: `<p>${n.body ?? ""}</p>${link ? `<p><a href="${link}">Open in Citrineland CRM</a></p>` : ""}<p style="color:#888;font-size:12px">You receive this because email notifications are on in your CRM profile.</p>` });
    await prisma.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
    if (r.ok) sent++;
  }
  return sent;
}

