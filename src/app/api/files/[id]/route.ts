import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { readLocal, signedDownloadUrl } from "@/lib/storage";
import { DOC_PERMS } from "@/server/documents";

export const dynamic = "force-dynamic";

/** Permission-checked, audited document download via a short-lived signed URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const perms = DOC_PERMS[doc.entityType];
  if (!perms || !can(user, perms.view) || (doc.isKyc && !can(user, "kyc:view"))) {
    await audit({ userId: user.id, ip: await clientIp() }, { entity: "Document", entityId: doc.id, action: "download_denied" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await audit({ userId: user.id, ip: await clientIp() }, { entity: "Document", entityId: doc.id, action: "download", after: { fileName: doc.fileName, entityType: doc.entityType, entityId: doc.entityId, isKyc: doc.isKyc } });
  const url = await signedDownloadUrl(doc.storageKey, doc.fileName, 300);
  if (url) return NextResponse.redirect(url, 302);
  const body = await readLocal(doc.storageKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
