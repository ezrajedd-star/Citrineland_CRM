"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { uploadDocument } from "@/server/actions/documents";

export function UploadForm({ entityType, entityId, categories, checklistItemId, compact }: { entityType: string; entityId: string; categories: { value: string; kyc: boolean }[]; checklistItemId?: string; compact?: boolean }) {
  const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);
  const [pending, start] = React.useTransition();
  const [cat, setCat] = React.useState(categories[0]?.value ?? "Other");
  const isKyc = categories.find((c) => c.value === cat)?.kyc ?? false;
  return (
    <form
      ref={ref}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadDocument(fd);
          if (r.ok) {
            toast.success("Uploaded");
            ref.current?.reset();
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="isKyc" value={String(isKyc)} />
      {checklistItemId && <input type="hidden" name="checklistItemId" value={checklistItemId} />}
      {categories.length > 1 ? (
        <NativeSelect name="category" value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value}
              {c.kyc ? " (KYC)" : ""}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <input type="hidden" name="category" value={cat} />
      )}
      <Input type="file" name="file" required className={compact ? "w-56 text-xs" : "w-auto max-w-xs"} accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Upload /> {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}
