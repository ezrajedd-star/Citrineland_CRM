import type { PrismaClient } from "@prisma/client";

/** Default configuration (not demo data): pipeline stages, picklists, documentation checklist. Idempotent. */
export async function seedConfig(prisma: PrismaClient) {
  if ((await prisma.pipelineStage.count()) === 0) {
    const stages = [
      { name: "New Inquiry", color: "#a8a29e", probability: 5, stalledAfterDays: 3 },
      { name: "Contacted", color: "#60a5fa", probability: 10, stalledAfterDays: 7 },
      { name: "Site Visit / Tripping", color: "#818cf8", probability: 25, stalledAfterDays: 10 },
      { name: "Computation Sent", color: "#f59e0b", probability: 45, stalledAfterDays: 7 },
      { name: "Negotiation", color: "#f97316", probability: 70, stalledAfterDays: 10 },
      { name: "Reserved", color: "#16a34a", probability: 100, stalledAfterDays: 365, isWon: true },
      { name: "Lost", color: "#dc2626", probability: 0, stalledAfterDays: 365, isLost: true },
    ];
    for (const [i, s] of stages.entries()) await prisma.pipelineStage.create({ data: { ...s, order: i + 1 } });
  }
  const picklists: Record<string, [string, string][]> = {
    LEAD_SOURCE: [
      ["BROKER_REFERRAL", "Broker referral"],
      ["WALK_IN", "Walk-in"],
      ["WEBSITE", "Website"],
      ["FACEBOOK", "Facebook"],
      ["EVENT", "Event / mall show"],
      ["REFERRAL", "Client referral"],
      ["OTHER", "Other"],
    ],
    LOST_REASON: [
      ["PRICE", "Price / budget"],
      ["FINANCING", "Did not qualify for financing"],
      ["LOCATION", "Location"],
      ["COMPETITOR", "Bought from competitor"],
      ["UNRESPONSIVE", "Unresponsive"],
      ["TIMING", "Not ready / timing"],
      ["OTHER", "Other"],
    ],
    DOCUMENT_CATEGORY: [
      ["ID", "Government ID"],
      ["INCOME", "Proof of income"],
      ["CONTRACT", "Contract"],
      ["OTHER", "Other"],
    ],
    CAMPAIGN_CHANNEL: [
      ["FACEBOOK", "Facebook / Instagram"],
      ["GOOGLE", "Google Ads"],
      ["EVENT", "Event / mall show"],
      ["PRINT", "Print / OOH"],
      ["EMAIL", "Email"],
      ["BROKER", "Broker activation"],
      ["OTHER", "Other"],
    ],
  };
  for (const [type, values] of Object.entries(picklists)) {
    for (const [i, [code, label]] of values.entries()) {
      await prisma.picklist.upsert({ where: { type_code: { type, code } }, create: { type, code, label, order: i + 1 }, update: {} });
    }
  }
  if ((await prisma.documentTemplateItem.count()) === 0) {
    const items = [
      { name: "Reservation Agreement (signed)", dueDaysAfterReservation: 3 },
      { name: "Buyer Information Sheet", dueDaysAfterReservation: 7 },
      { name: "Two (2) valid government IDs", dueDaysAfterReservation: 7 },
      { name: "TIN (ID or BIR form)", dueDaysAfterReservation: 14 },
      { name: "Proof of income", dueDaysAfterReservation: 30, schemeFilter: ["DP_BALANCE", "DEFERRED_CASH"] },
      { name: "Marriage certificate (PSA)", dueDaysAfterReservation: 30, marriedOnly: true },
      { name: "Signed Contract to Sell", dueDaysAfterReservation: 45 },
      { name: "Post-dated checks", dueDaysAfterReservation: 30, schemeFilter: ["DP_BALANCE", "DEFERRED_CASH"] },
      { name: "Bank loan documents / Letter of Guarantee", dueDaysAfterReservation: 120, financingFilter: ["BANK"] },
      { name: "Pag-IBIG loan documents", dueDaysAfterReservation: 120, financingFilter: ["PAGIBIG"] },
      { name: "Deed of Absolute Sale", dueDaysAfterReservation: 365, required: false },
    ];
    for (const [i, it] of items.entries()) await prisma.documentTemplateItem.create({ data: { ...(it as any), order: i + 1 } });
  }
}
