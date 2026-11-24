import { graphFor, markGraphError, GraphNotConnectedError } from "./client";

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { name: string; contentType: string; contentBytes: Buffer }[];
}

/**
 * Send from the user's own mailbox (appears in their Outlook Sent Items).
 * Creates a draft first so we learn the internetMessageId — the mailbox capture job uses it to avoid
 * logging the same email twice on the timeline.
 */
export async function sendMailAs(userId: string, m: OutgoingMail): Promise<{ ok: true; internetMessageId: string | null; webLink: string | null } | { ok: false; error: string }> {
  try {
    const client = graphFor(userId);
    const draft = await client.api("/me/messages").post({
      subject: m.subject,
      body: { contentType: "HTML", content: m.html },
      toRecipients: m.to.map((address) => ({ emailAddress: { address } })),
      ccRecipients: (m.cc ?? []).map((address) => ({ emailAddress: { address } })),
      attachments: (m.attachments ?? []).map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: a.contentBytes.toString("base64") })),
    });
    await client.api(`/me/messages/${draft.id}/send`).post({});
    return { ok: true, internetMessageId: draft.internetMessageId ?? null, webLink: draft.webLink ?? null };
  } catch (e) {
    await markGraphError(userId, e);
    return { ok: false, error: e instanceof GraphNotConnectedError ? e.message : `Outlook send failed: ${(e as Error).message}` };
  }
}
