import type { PrismaClient } from "@prisma/client";

export async function seedMarketing(prisma: PrismaClient, userIds: Record<string, string>) {
  if ((await prisma.campaign.count()) > 0) return;
  console.log("Seeding campaigns, templates and sequences…");
  const [ctr, amb] = await Promise.all([prisma.development.findUniqueOrThrow({ where: { code: "CTR" } }), prisma.development.findUniqueOrThrow({ where: { code: "AMB" } })]);
  const now = new Date();
  const d = (days: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  const campaigns = await Promise.all([
    prisma.campaign.create({ data: { name: "CTR Facebook Lead Ads (Demo)", code: "ctr-fb-q4", channel: "FACEBOOK", developmentId: ctr.id, budgetCents: 15_000_000n, startDate: d(-90), endDate: d(30), createdById: userIds.MARKETING_MANAGER } }),
    prisma.campaign.create({ data: { name: "Amberfield Mall Show (Demo)", code: "amb-mallshow", channel: "EVENT", developmentId: amb.id, budgetCents: 25_000_000n, startDate: d(-60), endDate: d(-30), active: false, createdById: userIds.MARKETING_MANAGER } }),
    prisma.campaign.create({ data: { name: "Broker Activation Night (Demo)", code: "broker-night", channel: "BROKER", budgetCents: 8_000_000n, startDate: d(-120), endDate: d(-110), active: false, createdById: userIds.MARKETING_MANAGER } }),
  ]);
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
  for (const [i, l] of leads.entries()) {
    const c = l.sourceCode === "FACEBOOK" ? campaigns[0] : l.sourceCode === "EVENT" ? campaigns[1] : l.sourceCode === "BROKER_REFERRAL" && i % 3 === 0 ? campaigns[2] : null;
    if (c) await prisma.lead.update({ where: { id: l.id }, data: { campaignId: c.id, utmCampaign: c.code, utmSource: c.channel.toLowerCase() } });
  }
  const t1 = await prisma.emailTemplate.create({
    data: {
      name: "Welcome — thanks for your inquiry",
      subject: "Your inquiry about {{development.name}}",
      bodyHtml: "<p>Hi {{lead.firstName}},</p><p>Thank you for your interest in {{development.name}}! I'm {{owner.name}}, and I'll be happy to walk you through the available units, prices and payment terms.</p><p>Would you like to schedule a site visit this week?</p><p>Best regards,<br/>{{owner.name}}<br/>{{owner.phone}}</p>",
      createdById: userIds.MARKETING_MANAGER,
    },
  });
  const t2 = await prisma.emailTemplate.create({
    data: {
      name: "Follow-up — site visit invitation",
      subject: "Visit {{development.name}} this weekend?",
      bodyHtml: "<p>Hi {{lead.firstName}},</p><p>Just checking in. We have site tours every Saturday and Sunday — I'd be glad to reserve a slot for you.</p><p>Regards,<br/>{{owner.name}}</p>",
      createdById: userIds.MARKETING_MANAGER,
    },
  });
  const stage = await prisma.pipelineStage.findFirst({ where: { name: "New Inquiry" } });
  await prisma.emailSequence.create({
    data: {
      name: "New inquiry nurture (Demo)",
      description: "Welcome email immediately, follow-up after 3 days.",
      triggerStageId: stage?.id ?? null,
      active: true,
      createdById: userIds.MARKETING_MANAGER,
      steps: { create: [{ order: 1, delayDays: 0, templateId: t1.id }, { order: 2, delayDays: 3, templateId: t2.id }] },
    },
  });
  await prisma.automationRule.create({
    data: {
      name: "Facebook leads → notify Marketing Manager (Demo)",
      trigger: "lead.created",
      conditions: [{ field: "lead.sourceCode", op: "eq", value: "FACEBOOK" }],
      actions: [{ type: "notify", params: { title: "New Facebook lead", body: "A lead came in from Facebook ads.", to: "role:MARKETING_MANAGER" } }],
      createdById: userIds.MARKETING_MANAGER,
    },
  });
}
