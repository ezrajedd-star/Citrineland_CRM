import type { PrismaClient } from "@prisma/client";
import { normalizeName } from "../src/lib/normalize";

const FIRST = ["Juan", "Maria", "Jose", "Ana", "Paolo", "Kristine", "Mark", "Angela", "Rafael", "Bianca", "Carlo", "Denise", "Enrique", "Faith", "Gabriel", "Hannah", "Ivan", "Joy", "Kevin", "Lianne", "Miguel", "Nicole", "Oscar", "Patricia", "Quentin", "Rhea", "Santiago", "Trisha", "Ulysses", "Vanessa", "Warren", "Ximena", "Yves", "Zara", "Andres", "Bettina", "Cesar", "Dahlia", "Emilio", "Frida"];
const LAST = ["Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza", "Torres", "Villanueva", "Ramos", "Aquino", "Castillo", "Navarro", "Flores", "Lim", "Tan", "Gonzales", "Cruz", "Del Rosario", "Pascual", "Soriano"];

/** Deterministic pseudo-random for reproducible demo data */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function seedDemoSales(prisma: PrismaClient, userIds: Record<string, string>) {
  if ((await prisma.brokerage.count()) > 0) {
    console.log("Demo brokers/leads already present — skipping.");
    return;
  }
  console.log("Seeding brokerages, brokers and leads…");
  const r = rng(42);
  const day = 86_400_000;
  const now = Date.now();
  const dateOnly = (ms: number) => {
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };

  const firms = [
    { name: "Sunrise Realty Partners (Demo)", city: "Makati City", defaultCommissionPct: 5, contactPerson: "Lorna Uy" },
    { name: "Bayanihan Homes Brokerage (Demo)", city: "Quezon City", defaultCommissionPct: 4.5, contactPerson: "Ramon Abad" },
    { name: "Golden Key Properties (Demo)", city: "Cebu City", defaultCommissionPct: 5, contactPerson: "Celia Ong" },
  ];
  const brokerages = [];
  for (const [i, f] of firms.entries()) {
    brokerages.push(
      await prisma.brokerage.create({
        data: {
          ...f,
          email: `info@brokerage${i + 1}.test`,
          phone: `(02) 8555-01${i}0`,
          accreditationStatus: "ACCREDITED",
          accreditationDate: dateOnly(now - 400 * day),
          accreditationExpiry: dateOnly(now + (i === 2 ? 45 : 300) * day),
          createdById: userIds.BNG_STAFF,
        },
      }),
    );
  }
  const brokerDefs = [
    ["Teresa", "Villareal", 0, "BROKER", 400],
    ["Noel", "Sarmiento", 0, "SALESPERSON", 220],
    ["Grace", "Lacson", 0, "SALESPERSON", 21], // license expiring within 30 days
    ["Dennis", "Ocampo", 1, "BROKER", 500],
    ["Mylene", "Fajardo", 1, "SALESPERSON", 180],
    ["Rico", "Manalo", 1, "SALESPERSON", 90],
    ["Liza", "Tolentino", 2, "BROKER", 640],
    ["Arnel", "Quiambao", 2, "SALESPERSON", 365],
    ["Joanna", "Salonga", 2, "SALESPERSON", 55],
    ["Felix", "Agustin", -1, "BROKER", 300], // independent
  ] as const;
  const brokers = [];
  for (const [i, [fn, ln, firm, role, expDays]] of brokerDefs.entries()) {
    brokers.push(
      await prisma.broker.create({
        data: {
          firstName: fn,
          lastName: ln,
          role,
          brokerageId: firm >= 0 ? brokerages[firm].id : null,
          prcLicenseNo: `DEMO-${String(100000 + i * 137)}`,
          prcLicenseExpiry: dateOnly(now + expDays * day),
          dhsudRegNo: `DHSUD-DEMO-${String(2000 + i)}`,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}@brokers.test`,
          mobile: `+63917555${String(1000 + i).slice(-4)}`,
          accreditationStatus: i === 5 ? "PENDING" : "ACCREDITED",
          accreditationDate: i === 5 ? null : dateOnly(now - 200 * day),
          accreditationExpiry: i === 5 ? null : dateOnly(now + (expDays + 30) * day),
          createdById: userIds.BNG_STAFF,
        },
      }),
    );
  }

  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: "asc" } });
  const devs = await prisma.development.findMany();
  const sources = ["BROKER_REFERRAL", "BROKER_REFERRAL", "BROKER_REFERRAL", "WALK_IN", "WEBSITE", "FACEBOOK", "EVENT", "REFERRAL"];
  const owners = [userIds.SALES_MANAGER, userIds.BNG_STAFF, userIds.MARKETING_MANAGER];
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const lost = stages.find((s) => s.isLost)!;
  const lostReasons = ["PRICE", "FINANCING", "LOCATION", "COMPETITOR", "UNRESPONSIVE", "TIMING"];
  for (let i = 0; i < 40; i++) {
    const fn = FIRST[i % FIRST.length];
    const ln = LAST[(i * 7) % LAST.length];
    // 30 open leads spread across open stages, 10 lost; won leads are created with transactions in Phase 4 seed
    const stage = i < 30 ? openStages[i % openStages.length] : lost;
    const created = now - Math.floor(r() * 120 + 5) * day;
    const src = sources[i % sources.length];
    const broker = src === "BROKER_REFERRAL" || r() < 0.4 ? brokers[i % brokers.length] : null;
    const dev = devs[i % devs.length];
    const lead = await prisma.lead.create({
      data: {
        firstName: fn,
        lastName: ln,
        normalizedName: normalizeName(fn, ln),
        email: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/\s/g, "")}${i}@example.test`,
        mobile: `+63918555${String(2000 + i).slice(-4)}`,
        sourceCode: src,
        developments: { connect: [{ id: dev.id }] },
        unitTypePref: dev.type === "CONDOMINIUM" ? "CONDO" : "HOUSE_AND_LOT",
        financingPref: (["BANK", "PAGIBIG", "SPOT_CASH", "IN_HOUSE", "UNDECIDED"] as const)[i % 5],
        budgetMinCents: BigInt(3_000_000_00 + (i % 5) * 50_000_000),
        budgetMaxCents: BigInt(5_000_000_00 + (i % 5) * 100_000_000),
        ownerId: owners[i % owners.length],
        brokerId: broker?.id ?? null,
        brokerageId: broker?.brokerageId ?? null,
        stageId: stage.id,
        stageChangedAt: new Date(Math.max(created, now - Math.floor(r() * 18) * day)),
        lastActivityAt: new Date(now - Math.floor(r() * 20) * day),
        lostReasonCode: stage.isLost ? lostReasons[i % lostReasons.length] : null,
        privacyConsent: true,
        privacyConsentAt: new Date(created),
        createdAt: new Date(created),
        createdById: owners[i % owners.length],
      },
    });
    // stage history: walk from first stage to current
    const path = stage.isLost ? [openStages[0], lost] : openStages.slice(0, openStages.indexOf(stage) + 1);
    let prev: string | null = null;
    for (const [k, s] of path.entries()) {
      await prisma.leadStageHistory.create({ data: { leadId: lead.id, fromStageId: prev, toStageId: s.id, createdAt: new Date(created + k * 3 * day) } });
      prev = s.id;
    }
    await prisma.activity.create({ data: { type: "NOTE", subject: "Initial inquiry", body: `Interested in ${dev.name}.`, leadId: lead.id, actorId: lead.ownerId, occurredAt: new Date(created) } });
    if (i % 3 === 0) await prisma.activity.create({ data: { type: "CALL", subject: "Follow-up call", body: "Discussed payment options.", leadId: lead.id, actorId: lead.ownerId, occurredAt: new Date(created + 2 * day) } });
    if (i % 4 === 0) await prisma.activity.create({ data: { type: "SITE_VISIT", subject: `Tripping at ${dev.name}`, leadId: lead.id, actorId: lead.ownerId, brokerId: broker?.id, occurredAt: new Date(created + 5 * day) } });
    if (i % 5 === 0 && !stage.isLost)
      await prisma.task.create({ data: { title: `Follow up with ${fn} ${ln}`, dueAt: new Date(now + ((i % 3) - 1) * day), assigneeId: lead.ownerId, leadId: lead.id, priority: i % 2 ? "HIGH" : "MEDIUM", createdById: lead.ownerId } });
  }
}
