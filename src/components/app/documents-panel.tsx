import { FileText, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { DOC_PERMS } from "@/server/documents";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "./page";
import { UploadForm } from "./upload-form";
import { ConfirmAction } from "./confirm-action";
import { deleteDocument } from "@/server/actions/documents";

export async function DocumentsPanel({ entityType, entityId, user, categories, kycCategories = [] }: { entityType: string; entityId: string; user: CurrentUser; categories: string[]; kycCategories?: string[] }) {
  const perms = DOC_PERMS[entityType];
  const canKyc = can(user, "kyc:view");
  const docs = await prisma.document.findMany({
    where: { entityType, entityId, deletedAt: null, ...(canKyc ? {} : { isKyc: false }) },
    orderBy: { createdAt: "desc" },
  });
  const hiddenKyc = canKyc ? 0 : await prisma.document.count({ where: { entityType, entityId, deletedAt: null, isKyc: true } });
  const canUpload = can(user, perms.upload);
  const uploadCats = [...categories.map((c) => ({ value: c, kyc: false })), ...(can(user, "kyc:upload") ? kycCategories.map((c) => ({ value: c, kyc: true })) : [])];
  return (
    <div className="space-y-4">
      {canUpload && uploadCats.length > 0 && <UploadForm entityType={entityType} entityId={entityId} categories={uploadCats} />}
      {hiddenKyc > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> {hiddenKyc} KYC document(s) hidden — requires KYC access.
        </p>
      )}
      {docs.length === 0 ? (
        <EmptyState title="No documents yet" />
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 text-stone-400" />
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${d.id}`} className="font-medium text-brand-800 hover:underline">
                  {d.fileName}
                </a>
                <div className="text-xs text-muted-foreground">
                  {d.category} {d.isKyc && "· KYC"} · {(d.size / 1024).toFixed(0)} KB · {formatDateTime(d.createdAt)}
                </div>
              </div>
              {canUpload && (
                <ConfirmAction action={deleteDocument} args={{ id: d.id }} title="Remove this document?" destructive variant="ghost">
                  Remove
                </ConfirmAction>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
