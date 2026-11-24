/**
 * Integration tests against the database (requires DATABASE_URL and seeded data).
 * Run: npm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createReservation, cancelTransaction, recordPayment } from "@/server/transactions";
import { placeHold } from "@/server/holds";
import { manilaToday } from "@/lib/format";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("reservations (database)", () => {
  let userId: string;
  let schemeId: string;
  const leadIds: string[] = [];
  const created: string[] = [];

  beforeAll(async () => {
    process.env.DISABLE_EVENTS = "true";
    const admin = await prisma.user.findFirstOrThrow({ where: { role: { key: "ADMIN" } } });
    userId = admin.id;
    const dev = await prisma.development.findFirstOrThrow({ where: { code: "CTR" } });
    schemeId = (await prisma.paymentScheme.findFirstOrThrow({ where: { developmentId: dev.id, kind: "DP_BALANCE" } })).id;
    const leads = await prisma.lead.findMany({ where: { stage: { isWon: false, isLost: false }, deletedAt: null }, take: 3 });
    leadIds.push(...leads.map((l) => l.id));
  });

  afterAll(async () => {
    for (const id of created) {
      const t = await prisma.transaction.findUnique({ where: { id } });
      if (t && t.status !== "CANCELLED") await cancelTransaction({ transactionId: id, reason: "test cleanup" }, { userId });
    }
    await prisma.$disconnect();
  });

  async function freeUnit() {
    return prisma.unit.findFirstOrThrow({ where: { status: "AVAILABLE", development: { code: "CTR" }, deletedAt: null }, orderBy: { code: "desc" } });
  }

  it("only one of two concurrent reservations of the same unit succeeds", async () => {
    const unit = await freeUnit();
    const attempt = (leadId: string) =>
      createReservation({ leadId, unitId: unit.id, parkingSlotIds: [], paymentSchemeId: schemeId, reservationDate: manilaToday(), reservationFeePaid: true, orNumber: null }, { userId, ip: null });
    const results = await Promise.allSettled([attempt(leadIds[0]), attempt(leadIds[1])]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason?.message)).toMatch(/no longer available|on hold/i);
    created.push((ok[0] as PromiseFulfilledResult<{ id: string }>).value.id);
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(u.status).toBe("RESERVED");
    const items = await prisma.transactionItem.count({ where: { unitId: unit.id, active: true } });
    expect(items).toBe(1);
  });

  it("creates schedule, checklist and records the reservation fee", async () => {
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: created[0] }, include: { schedule: true, documents: true, payments: true } });
    expect(t.schedule.length).toBeGreaterThan(30);
    expect(t.documents.length).toBeGreaterThan(3);
    expect(t.payments).toHaveLength(1);
    expect(t.schedule.reduce((a, s) => a + s.amountCents, 0n)).toBe(t.tcpCents);
    expect(t.schedule[0].paidCents).toBe(t.reservationFeeCents);
  });

  it("refuses to reserve a unit held by someone else, but allows the holder", async () => {
    const unit = await freeUnit();
    const hold = await placeHold({ ref: { kind: "UNIT", id: unit.id }, leadId: leadIds[2] }, { userId, ip: null });
    await expect(createReservation({ leadId: leadIds[2], unitId: unit.id, parkingSlotIds: [], paymentSchemeId: schemeId, reservationDate: manilaToday() }, { userId, ip: null })).rejects.toThrow(/on hold/i);
    const t = await createReservation({ leadId: leadIds[2], unitId: unit.id, parkingSlotIds: [], holdId: hold.id, paymentSchemeId: schemeId, reservationDate: manilaToday() }, { userId, ip: null });
    created.push(t.id);
    expect((await prisma.hold.findUniqueOrThrow({ where: { id: hold.id } })).status).toBe("CONVERTED");
  });

  it("enforces the parking ownership rule for standalone parking", async () => {
    const slot = await prisma.parkingSlot.findFirstOrThrow({ where: { status: "AVAILABLE", development: { code: "CTR" } } });
    const lonely = await prisma.lead.findFirstOrThrow({ where: { stage: { isWon: false, isLost: false }, deletedAt: null, id: { notIn: leadIds }, clientId: null } });
    await expect(createReservation({ leadId: lonely.id, parkingSlotIds: [slot.id], paymentSchemeId: schemeId, reservationDate: manilaToday() }, { userId, ip: null })).rejects.toThrow(/same building/i);
  });

  it("cancellation releases inventory back to AVAILABLE", async () => {
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: created[0] }, include: { items: true } });
    await recordPayment({ transactionId: t.id, paidAt: manilaToday(), amountCents: 100_000_00, method: "BANK_TRANSFER" }, { userId, ip: null });
    await cancelTransaction({ transactionId: t.id, reason: "Buyer backed out (test)" }, { userId });
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: t.items[0].unitId! } });
    expect(u.status).toBe("AVAILABLE");
    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("CANCELLED");
    expect((after.macedaSnapshot as any).qualifiesForRefund).toBe(false);
  });
});
