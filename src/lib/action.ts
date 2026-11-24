import "server-only";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "./session";
import { ForbiddenError, assertCan } from "./rbac/can";
import type { Permission } from "./rbac/permissions";
import { clientIp } from "./request";
import { logger } from "./logger";
import type { ActorCtx } from "./audit";
import { DomainError } from "@/domain/errors";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string; redirect?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export interface ActionCtx extends ActorCtx {
  user: CurrentUser;
  userId: string;
}

/**
 * Wraps a server action: authenticates, enforces a permission on the server, validates input with Zod,
 * and converts known errors into a typed result for forms.
 */
export function action<S extends z.ZodTypeAny, T>(
  permission: Permission | Permission[] | null,
  schema: S,
  handler: (input: z.infer<S>, ctx: ActionCtx) => Promise<T | ActionResult<T>>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await getCurrentUser();
      if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
      if (permission) {
        const list = Array.isArray(permission) ? permission : [permission];
        if (!list.some((p) => user.permissions.has("*") || user.permissions.has(p))) assertCan(user, list[0]);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: "Please check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors as any };
      }
      const ctx: ActionCtx = { user, userId: user.id, ip: await clientIp() };
      const result = await handler(parsed.data, ctx);
      if (result && typeof result === "object" && "ok" in (result as any)) return result as ActionResult<T>;
      return { ok: true, data: result as T };
    } catch (e) {
      return toActionError(e);
    }
  };
}

export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message };
  if (e instanceof DomainError) return { ok: false, error: e.message };
  if (e instanceof ZodError) return { ok: false, error: "Invalid input.", fieldErrors: e.flatten().fieldErrors as any };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: `A record with this ${(e.meta?.target as string[] | undefined)?.join(", ") ?? "value"} already exists.` };
    if (e.code === "P2025") return { ok: false, error: "Record not found (it may have been deleted)." };
  }
  // Next.js redirect()/notFound() must propagate
  if (e && typeof e === "object" && "digest" in e && String((e as any).digest).startsWith("NEXT_")) throw e;
  logger.error({ err: e }, "server action failed");
  return { ok: false, error: "Something went wrong. Please try again." };
}
