import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const messages: any[] = [];
vi.mock("@/server/graph/client", () => ({
  graphFor: () => ({
    api: () => ({ header: () => ({ get: async () => ({ value: messages }) }), get: async () => ({ value: [] }) }),
  }),
  markGraphError: async () => {},
  graphConfigured: () => true,
  GraphNotConnectedError: class extends Error {},
}));

const d = process.env.DATABASE_URL ? describe : describe.skip;

d("Outlook email capture (mocked Graph)", () => {
  let userId: string;
  let leadId: string;
  let leadEmail: string;
  beforeAll(async () => {
    process.env.DISABLE_EVENTS = "true";
    const u = await prisma.user.findFirstOrThrow({ where: { role: { key: "SALES_MANAGER" } } });
    userId = u.id;
    await prisma.microsoftConnection.upsert({ where: { userId }, create: { userId, email: u.email, refreshTokenEnc: "x", status: "CONNECTED" }, update: { status: "CONNECTED", lastMailSyncAt: null, email: u.email } });
    const lead = await prisma.lead.findFirstOrThrow({ where: { email: { not: null }, deletedAt: null } });
    leadId = lead.id;
    leadEmail = lead.email!;
    messages.push(
      { id: "m1", internetMessageId: "<m1@test>", subject: "Re: Sample computation", bodyPreview: "Thanks, can we visit Saturday?", from: { emailAddress: { address: leadEmail } }, toRecipients: [{ emailAddress: { address: u.email } }], ccRecipients: [], receivedDateTime: new Date().toISOString(), webLink: "https://outlook.office.com/x" },
      { id: "m2", internetMessageId: "<m2@test>", subject: "Internal only", bodyPreview: "lunch?", from: { emailAddress: { address: "someone@citrineland.test" } }, toRecipients: [{ emailAddress: { address: u.email } }], ccRecipients: [], receivedDateTime: new Date().toISOString() },
      { id: "m3", internetMessageId: "<m3@test>", subject: "Newsletter", bodyPreview: "unknown sender", from: { emailAddress: { address: "news@unknown.example" } }, toRecipients: [{ emailAddress: { address: u.email } }], ccRecipients: [], receivedDateTime: new Date().toISOString() },
    );
  });
  afterAll(async () => {
    await prisma.activity.deleteMany({ where: { externalKey: { startsWith: "mail:<m" } } });
    await prisma.microsoftConnection.deleteMany({ where: { userId } });
  });

  it("logs emails with known contacts only, once", async () => {
    const { syncMailbox } = await import("@/server/graph/sync");
    const r1 = await syncMailbox(userId);
    expect(r1.logged).toBe(1);
    const act = await prisma.activity.findFirstOrThrow({ where: { externalKey: `mail:<m1@test>:lead:${leadId}` } });
    expect(act.type).toBe("EMAIL_IN");
    expect(act.body).toContain("Saturday");
    await prisma.microsoftConnection.update({ where: { userId }, data: { lastMailSyncAt: null } });
    const r2 = await syncMailbox(userId);
    expect(r2.logged).toBe(0);
  });
});
