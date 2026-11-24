import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { graphFor, markGraphError, GraphNotConnectedError } from "./client";

/** Create an Outlook calendar event for a meeting/site-visit activity, optionally inviting the contact. */
export async function createCalendarEventForActivity(
  activityId: string,
  userId: string,
  opts: { endsAt?: Date | null; location?: string | null; inviteContact?: boolean },
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const act = await prisma.activity.findUniqueOrThrow({ where: { id: activityId }, include: { lead: true, client: true, broker: true } });
  const contact = act.lead ?? act.client ?? act.broker;
  const start = act.occurredAt;
  const end = opts.endsAt ?? new Date(start.getTime() + 60 * 60_000);
  const attendees = opts.inviteContact && contact?.email ? [{ emailAddress: { address: contact.email, name: fullName(contact as any) }, type: "required" }] : [];
  try {
    const ev = await graphFor(userId)
      .api("/me/events")
      .post({
        subject: act.subject,
        body: { contentType: "Text", content: act.body ?? "" },
        start: { dateTime: start.toISOString().replace("Z", ""), timeZone: "UTC" },
        end: { dateTime: end.toISOString().replace("Z", ""), timeZone: "UTC" },
        location: opts.location ? { displayName: opts.location } : undefined,
        attendees,
        categories: ["Citrineland CRM"],
      });
    await prisma.activity.update({ where: { id: activityId }, data: { meta: { ...((act.meta as object) ?? {}), outlookEventId: ev.id, outlookLink: ev.webLink }, externalKey: `event:${ev.id}` } });
    return { ok: true, eventId: ev.id };
  } catch (e) {
    await markGraphError(userId, e);
    return { ok: false, error: e instanceof GraphNotConnectedError ? "Microsoft 365 not connected" : (e as Error).message };
  }
}
