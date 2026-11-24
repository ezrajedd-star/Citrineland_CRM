import { graphFor, markGraphError, GraphNotConnectedError } from "./client";

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { name: string; contentType: string; contentBytes: Buffer }[];
}

/** Send from the user's own mailbox (appears in their Outlook Sent Items). */
export async function sendMailAs(userId: string, m: OutgoingMail): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await graphFor(userId)
      .api("/me/sendMail")
      .post({
        message: {
          subject: m.subject,
          body: { contentType: "HTML", content: m.html },
          toRecipients: m.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (m.cc ?? []).map((address) => ({ emailAddress: { address } })),
          attachments: (m.attachments ?? []).map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: a.contentBytes.toString("base64") })),
        },
        saveToSentItems: true,
      });
    return { ok: true };
  } catch (e) {
    await markGraphError(userId, e);
    return { ok: false, error: e instanceof GraphNotConnectedError ? e.message : `Outlook send failed: ${(e as Error).message}` };
  }
}
