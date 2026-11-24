"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { clientIp } from "@/lib/request";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseFile, previewImport, commitImport, type PreviewRow } from "@/server/import-inventory";
import { DomainError } from "@/domain/errors";
import { parseDay } from "@/lib/format";

export async function previewInventoryImport(fd: FormData): Promise<ActionResult<{ rows: PreviewRow[]; raw: Record<string, string>[] }>> {
  try {
    const user = await getCurrentUser();
    if (!user || !can(user, "units:import")) throw new DomainError("You don't have permission to import inventory.");
    const file = fd.get("file");
    const developmentId = String(fd.get("developmentId") ?? "");
    if (!developmentId) throw new DomainError("Choose a development.");
    if (!(file instanceof File) || !file.size) throw new DomainError("Choose a file.");
    const raw = await parseFile(file);
    const rows = await previewImport(developmentId, raw, can(user, "price_lists:update"));
    return { ok: true, data: { rows, raw } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function commitInventoryImport(input: { developmentId: string; raw: Record<string, string>[]; effectiveDate?: string }): Promise<ActionResult<{ created: number; updated: number; prices: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user || !can(user, "units:import")) throw new DomainError("You don't have permission to import inventory.");
    const r = await commitImport(input.developmentId, input.raw, can(user, "price_lists:update"), { userId: user.id, ip: await clientIp() }, parseDay(input.effectiveDate) ?? undefined);
    revalidatePath("/inventory");
    return { ok: true, data: r, message: `Imported: ${r.created} created, ${r.updated} updated, ${r.prices} price(s) set` };
  } catch (e) {
    return toActionError(e);
  }
}
