"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { action, toActionError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { clientIp } from "@/lib/request";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putObject, storageKey } from "@/lib/storage";
import { DOC_PERMS } from "@/server/documents";
import { DomainError } from "@/domain/errors";

export async function uploadDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Session expired" };
    const entityType = String(formData.get("entityType") ?? "");
    const entityId = String(formData.get("entityId") ?? "");
    const category = String(formData.get("category") ?? "Other").slice(0, 80);
    const isKyc = formData.get("isKyc") === "true";
    const file = formData.get("file");
    const perms = DOC_PERMS[entityType];
    if (!perms || !entityId) throw new DomainError("Invalid document target");
    if (!can(user, perms.upload) || (isKyc && !can(user, "kyc:upload"))) throw new DomainError("You don't have permission to upload here.");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Choose a file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("File is larger than 15 MB.");
    if (!ALLOWED_TYPES.includes(file.type)) throw new DomainError(`File type ${file.type || "unknown"} is not allowed. Use PDF, images, Word or Excel.`);
    const key = storageKey(`${entityType.toLowerCase()}/${entityId}`, file.name);
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
    const doc = await prisma.document.create({
      data: { entityType, entityId, category, isKyc, fileName: file.name, contentType: file.type, size: file.size, storageKey: key, uploadedById: user.id },
    });
    // Optionally link to a transaction checklist item
    const checklistId = formData.get("checklistItemId");
    if (checklistId && entityType === "Transaction") {
      await prisma.transactionDocument.update({ where: { id: String(checklistId) }, data: { documentId: doc.id, status: "SUBMITTED" } });
    }
    await audit({ userId: user.id, ip: await clientIp() }, { entity: "Document", entityId: doc.id, action: "upload", after: { entityType, entityId, category, fileName: file.name, isKyc } });
    revalidatePath(perms.path(entityId).split("?")[0]);
    return { ok: true, data: { id: doc.id }, message: "Uploaded" };
  } catch (e) {
    return toActionError(e);
  }
}

export const deleteDocument = action(null, z.object({ id: z.string() }), async ({ id }, ctx) => {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
  const perms = DOC_PERMS[doc.entityType];
  if (!perms || !can(ctx.user, perms.upload) || (doc.isKyc && !can(ctx.user, "kyc:upload"))) throw new DomainError("You can't delete this document.");
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.transactionDocument.updateMany({ where: { documentId: id }, data: { documentId: null, status: "PENDING" } });
  await audit(ctx, { entity: "Document", entityId: id, action: "delete", before: doc });
  revalidatePath(perms.path(doc.entityId).split("?")[0]);
  return { ok: true as const, message: "Document removed" };
});
