import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";

export interface ActorCtx {
  userId: string | null;
  ip?: string | null;
}

export const SYSTEM_CTX: ActorCtx = { userId: null, ip: null };

const IGNORED = new Set(["updatedAt", "createdAt", "passwordHash", "refreshTokenEnc", "accessTokenEnc"]);

function plain(v: unknown): unknown {
  if (v === undefined) return null;
  return JSON.parse(JSON.stringify(v ?? null));
}

/** Shallow field-level diff: { field: [before, after] } */
export function diffObjects(before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined) {
  const out: Record<string, [unknown, unknown]> = {};
  const b = (plain(before) as Record<string, unknown>) ?? {};
  const a = (plain(after) as Record<string, unknown>) ?? {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (IGNORED.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out[k] = [b[k] ?? null, a[k] ?? null];
  }
  return out;
}

function scrub(o: unknown) {
  if (!o || typeof o !== "object") return plain(o);
  const c = { ...(plain(o) as Record<string, unknown>) };
  for (const k of IGNORED) if (k !== "updatedAt" && k !== "createdAt") delete c[k];
  return c;
}

export async function audit(
  ctx: ActorCtx,
  entry: { entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
  tx: Tx = prisma,
) {
  const diff = entry.before || entry.after ? diffObjects(entry.before as any, entry.after as any) : null;
  await tx.auditLog.create({
    data: {
      actorId: ctx.userId,
      ip: ctx.ip ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: (entry.before ? scrub(entry.before) : undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ? scrub(entry.after) : undefined) as Prisma.InputJsonValue | undefined,
      diff: (diff ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
