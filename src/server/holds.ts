import { prisma } from "@/lib/db";
import { audit, SYSTEM_CTX, type ActorCtx } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { DomainError } from "@/domain/errors";
import { applyInventoryEvent, lockItem, type ItemRef } from "./inventory";
import { notifyUsers } from "./notifications";
import { formatDateTime } from "@/lib/format";

export async function placeHold(
  input: { ref: ItemRef; leadId?: string | null; clientId?: string | null; brokerId?: string | null; hours?: number | null; notes?: string | null },
  ctx: ActorCtx & { userId: string },
) {
  const settings = await getSettings();
  const hours = input.hours ?? settings.holdDurationHours;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  return prisma.$transaction(async (tx) => {
    const item = await lockItem(tx, input.ref);
    if (item.status !== "AVAILABLE") throw new DomainError(`${item.code} is ${item.status.replace("_", " ").toLowerCase()} and can't be held.`);
    await applyInventoryEvent(tx, input.ref, "HOLD", ctx, input.notes, item);
    const hold = await tx.hold.create({
      data: {
        unitId: input.ref.kind === "UNIT" ? input.ref.id : null,
        parkingSlotId: input.ref.kind === "PARKING" ? input.ref.id : null,
        placedById: ctx.userId,
        leadId: input.leadId ?? null,
        clientId: input.clientId ?? null,
        brokerId: input.brokerId ?? null,
        expiresAt,
        notes: input.notes ?? null,
      },
    });
    if (input.leadId) {
      await tx.activity.create({
        data: { type: "SYSTEM", subject: `Hold placed on ${item.code} until ${formatDateTime(expiresAt)}`, leadId: input.leadId, actorId: ctx.userId },
      });
    }
    await audit(ctx, { entity: "Hold", entityId: hold.id, action: "create", after: hold }, tx);
    return hold;
  });
}

/** Release an active hold (manually or by expiry). `expired` uses the EXPIRE_HOLD event and status EXPIRED. */
export async function releaseHold(holdId: string, ctx: ActorCtx, opts: { reason?: string; expired?: boolean; canReleaseOthers?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.hold.findUnique({ where: { id: holdId } });
    if (!hold || hold.status !== "ACTIVE") throw new DomainError("This hold is no longer active.");
    if (!opts.expired && !opts.canReleaseOthers && hold.placedById !== ctx.userId) throw new DomainError("Only the holder or a user with holds:release can release this hold.");
    const ref: ItemRef = hold.unitId ? { kind: "UNIT", id: hold.unitId } : { kind: "PARKING", id: hold.parkingSlotId! };
    const item = await lockItem(tx, ref);
    if (item.status === "ON_HOLD") await applyInventoryEvent(tx, ref, opts.expired ? "EXPIRE_HOLD" : "RELEASE_HOLD", ctx, opts.reason ?? null, item);
    const updated = await tx.hold.update({
      where: { id: holdId },
      data: { status: opts.expired ? "EXPIRED" : "RELEASED", releasedAt: new Date(), releaseReason: opts.reason ?? (opts.expired ? "Expired" : "Released") },
    });
    await audit(ctx, { entity: "Hold", entityId: holdId, action: opts.expired ? "expire" : "release", before: hold, after: updated }, tx);
    return { hold: updated, code: item.code };
  });
}

/** Worker: auto-release expired holds and notify holders. */
export async function expireHolds(now = new Date()) {
  const due = await prisma.hold.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, select: { id: true, placedById: true, leadId: true } });
  let released = 0;
  for (const h of due) {
    try {
      const { code } = await releaseHold(h.id, SYSTEM_CTX, { expired: true });
      released++;
      await notifyUsers([h.placedById], {
        title: `Hold expired: ${code}`,
        body: `Your hold on ${code} expired and the unit is available again.`,
        link: `/inventory?q=${encodeURIComponent(code)}`,
        kind: "HOLD",
        dedupeKey: `hold-expired:${h.id}`,
      });
      if (h.leadId) await prisma.activity.create({ data: { type: "SYSTEM", subject: `Hold on ${code} expired`, leadId: h.leadId } });
    } catch {
      // already released by someone else — ignore
    }
  }
  return released;
}

/** Worker: notify holders when a hold is about to expire. */
export async function notifyHoldsNearingExpiry(hoursBefore: number, now = new Date()) {
  const { builtinRule } = await import("./automation/engine");
  const rule = await builtinRule("hold_expiry");
  if (!rule.enabled) return 0;
  hoursBefore = Number(rule.config.hoursBefore ?? hoursBefore);
  const soon = new Date(now.getTime() + hoursBefore * 3_600_000);
  const holds = await prisma.hold.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: now, lte: soon }, nearExpiryNotifiedAt: null },
    include: { unit: { select: { code: true } }, parkingSlot: { select: { code: true } } },
  });
  for (const h of holds) {
    const code = h.unit?.code ?? h.parkingSlot?.code ?? "item";
    await notifyUsers([h.placedById], {
      title: `Hold expiring soon: ${code}`,
      body: `Expires ${formatDateTime(h.expiresAt)}. Reserve or extend before it is auto-released.`,
      link: `/inventory?q=${encodeURIComponent(code)}`,
      kind: "HOLD",
      dedupeKey: `hold-near:${h.id}`,
    });
    await prisma.hold.update({ where: { id: h.id }, data: { nearExpiryNotifiedAt: now } });
  }
  return holds.length;
}
