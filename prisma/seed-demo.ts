import type { PrismaClient } from "@prisma/client";

/** Demo data (obviously fictional: ".test" emails, 0917-555 numbers, invented names). */
export async function seedDemo(prisma: PrismaClient, roles: Record<string, string>, demoPasswordHash: string) {
  const users = [
    { email: "sales.manager@citrineland.test", name: "Sofia Salazar", role: "SALES_MANAGER" },
    { email: "marketing.manager@citrineland.test", name: "Marco Mendoza", role: "MARKETING_MANAGER" },
    { email: "bng.staff@citrineland.test", name: "Bea Navarro", role: "BNG_STAFF" },
  ];
  const userIds: Record<string, string> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, roleId: roles[u.role], status: "ACTIVE", passwordHash: demoPasswordHash },
      update: { roleId: roles[u.role], status: "ACTIVE", passwordHash: demoPasswordHash },
    });
    userIds[u.role] = row.id;
  }
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { key: "ADMIN" } } });
  userIds.ADMIN = admin.id;

  if (await prisma.development.findUnique({ where: { code: "CTR" } })) {
    console.log("Demo developments already present — skipping inventory seed.");
  } else {
    await seedInventory(prisma, admin.id);
  }
  const { seedDemoSales } = await import("./seed-sales");
  await seedDemoSales(prisma, userIds);
}

async function seedInventory(prisma: PrismaClient, adminId: string) {
  console.log("Seeding developments & inventory…");
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  // ── Condo tower: 10 floors × 8 units, 60 parking slots ──
  const tower = await prisma.development.create({
    data: {
      code: "CTR",
      name: "Citrine Residences Tower",
      type: "CONDOMINIUM",
      status: "PRE_SELLING",
      address: "123 Sample Avenue (fictional)",
      city: "Pasig City",
      province: "Metro Manila",
      ltsNumber: "LTS-DEMO-0001",
      targetTurnoverDate: new Date(Date.UTC(2029, 5, 30)),
      description: "A fictional 10-storey residential tower used for demo data.",
      createdById: adminId,
    },
  });
  const towerA = await prisma.section.create({ data: { developmentId: tower.id, kind: "TOWER", name: "Tower A", code: "TA", floors: 10, sortOrder: 0 } });
  const layouts = [
    { model: "Studio", type: "CONDO", area: 24.5, br: 0, ba: 1, base: 3_200_000 },
    { model: "1BR Deluxe", type: "CONDO", area: 36.0, br: 1, ba: 1, base: 4_650_000 },
    { model: "1BR Deluxe", type: "CONDO", area: 36.0, br: 1, ba: 1, base: 4_650_000 },
    { model: "2BR Suite", type: "CONDO", area: 58.0, br: 2, ba: 2, base: 7_400_000 },
    { model: "2BR Suite", type: "CONDO", area: 58.0, br: 2, ba: 2, base: 7_400_000 },
    { model: "1BR Deluxe", type: "CONDO", area: 36.0, br: 1, ba: 1, base: 4_650_000 },
    { model: "1BR Deluxe", type: "CONDO", area: 36.0, br: 1, ba: 1, base: 4_650_000 },
    { model: "Studio", type: "CONDO", area: 24.5, br: 0, ba: 1, base: 3_200_000 },
  ] as const;
  const views = ["City view", "Amenity view", "Amenity view", "Corner, skyline", "Corner, park", "Amenity view", "Amenity view", "City view"];
  const unitRows: any[] = [];
  for (let floor = 1; floor <= 10; floor++) {
    layouts.forEach((l, i) => {
      const price = Math.round((l.base * (1 + (floor - 1) * 0.012)) / 1000) * 1000;
      unitRows.push({
        developmentId: tower.id,
        sectionId: towerA.id,
        code: `TA-${floor}${String(i + 1).padStart(2, "0")}`,
        floor,
        unitType: l.type,
        model: l.model,
        floorArea: l.area,
        bedrooms: l.br,
        bathrooms: l.ba,
        orientation: views[i],
        listPriceCents: BigInt(price * 100),
        createdById: adminId,
      });
    });
  }
  await prisma.unit.createMany({ data: unitRows });
  const slotRows: any[] = [];
  for (let i = 1; i <= 60; i++) {
    const level = i <= 30 ? "B1" : "B2";
    const type = i % 20 === 0 ? "PWD" : i % 15 === 0 ? "EV" : i % 10 === 0 ? "TANDEM" : "REGULAR";
    const price = type === "TANDEM" ? 1_350_000 : type === "EV" ? 950_000 : 850_000;
    slotRows.push({ developmentId: tower.id, sectionId: towerA.id, code: `${level}-${String(i).padStart(3, "0")}`, level, type, listPriceCents: BigInt(price * 100), createdById: adminId });
  }
  await prisma.parkingSlot.createMany({ data: slotRows });

  // ── Subdivision: 4 blocks × 20 lots ──
  const subd = await prisma.development.create({
    data: {
      code: "AMB",
      name: "Amberfield Estates",
      type: "SUBDIVISION",
      status: "RFO",
      address: "Km 99 Demo Highway (fictional)",
      city: "Silang",
      province: "Cavite",
      ltsNumber: "LTS-DEMO-0002",
      targetTurnoverDate: new Date(Date.UTC(2027, 11, 15)),
      description: "A fictional horizontal community used for demo data.",
      createdById: adminId,
    },
  });
  const phase = await prisma.section.create({ data: { developmentId: subd.id, kind: "PHASE", name: "Phase 1", code: "P1", sortOrder: 0 } });
  const lotRows: any[] = [];
  for (let b = 1; b <= 4; b++) {
    const block = await prisma.section.create({ data: { developmentId: subd.id, kind: "BLOCK", name: `Block ${b}`, code: `B${b}`, parentId: phase.id, sortOrder: b } });
    for (let lot = 1; lot <= 20; lot++) {
      const lotOnly = b === 4 && lot > 12;
      const corner = lot === 1 || lot === 20;
      const lotArea = corner ? 150 : 120;
      const price = lotOnly ? lotArea * 18_500 : (corner ? 6_850_000 : 5_950_000) + (b - 1) * 50_000;
      lotRows.push({
        developmentId: subd.id,
        sectionId: block.id,
        code: `B${b}-L${String(lot).padStart(2, "0")}`,
        block: String(b),
        lot: String(lot),
        unitType: lotOnly ? "LOT_ONLY" : "HOUSE_AND_LOT",
        model: lotOnly ? null : lot % 2 ? "Amber (2-storey)" : "Topaz (bungalow)",
        floorArea: lotOnly ? null : lot % 2 ? 88 : 64,
        lotArea,
        bedrooms: lotOnly ? null : lot % 2 ? 3 : 2,
        bathrooms: lotOnly ? null : lot % 2 ? 2 : 1,
        orientation: lot <= 10 ? "North-facing" : "South-facing",
        listPriceCents: BigInt(price * 100),
        createdById: adminId,
      });
    }
  }
  await prisma.unit.createMany({ data: lotRows });

  // ── Price lists v1 (applied) ──
  for (const dev of [tower, subd]) {
    const [units, slots] = await Promise.all([prisma.unit.findMany({ where: { developmentId: dev.id } }), prisma.parkingSlot.findMany({ where: { developmentId: dev.id } })]);
    await prisma.priceList.create({
      data: {
        developmentId: dev.id,
        version: 1,
        effectiveDate: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
        appliedAt: new Date(),
        notes: "Launch price list",
        createdById: adminId,
        items: { create: [...units.map((u) => ({ unitId: u.id, priceCents: u.listPriceCents })), ...slots.map((s) => ({ parkingSlotId: s.id, priceCents: s.listPriceCents }))] },
      },
    });
  }

  // ── Payment schemes ──
  const schemes = [
    { developmentId: null, name: "Spot cash (8% discount)", kind: "SPOT_CASH", reservationFeeCents: 2_500_000n, spotDiscountPct: 8, sortOrder: 0 },
    { developmentId: null, name: "Deferred cash, 36 months", kind: "DEFERRED_CASH", reservationFeeCents: 2_500_000n, deferredMonths: 36, sortOrder: 1 },
    { developmentId: tower.id, name: "20% DP over 36 months, bank financing", kind: "DP_BALANCE", reservationFeeCents: 2_500_000n, dpPct: 20, dpMonths: 36, financing: "BANK", interestRatePct: 7.5, termMonths: 240, sortOrder: 2 },
    { developmentId: tower.id, name: "10% spot DP (5% discount), bank financing", kind: "DP_BALANCE", reservationFeeCents: 2_500_000n, dpPct: 10, dpMonths: 0, spotDpDiscountPct: 5, financing: "BANK", interestRatePct: 7.5, termMonths: 240, sortOrder: 3 },
    { developmentId: subd.id, name: "15% DP over 24 months, Pag-IBIG", kind: "DP_BALANCE", reservationFeeCents: 2_000_000n, dpPct: 15, dpMonths: 24, financing: "PAGIBIG", interestRatePct: 6.375, termMonths: 360, sortOrder: 2 },
    { developmentId: subd.id, name: "20% DP over 12 months, in-house 5 years", kind: "DP_BALANCE", reservationFeeCents: 2_000_000n, dpPct: 20, dpMonths: 12, financing: "IN_HOUSE", interestRatePct: 16, termMonths: 60, sortOrder: 3 },
  ];
  for (const s of schemes) await prisma.paymentScheme.create({ data: { ...(s as any), createdById: adminId } });
}
