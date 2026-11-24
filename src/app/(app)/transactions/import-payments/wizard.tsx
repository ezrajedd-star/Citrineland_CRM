"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { previewPaymentsCsv, commitPaymentsCsv } from "@/server/actions/transactions";
import type { PaymentPreviewRow } from "@/server/import-payments";

export function PaymentImport() {
  const router = useRouter();
  const [preview, setPreview] = React.useState<{ rows: PaymentPreviewRow[]; raw: Record<string, string>[] } | null>(null);
  const [pending, start] = React.useTransition();
  const good = preview?.rows.filter((r) => r.ok).length ?? 0;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await previewPaymentsCsv(fd);
              if (r.ok) setPreview(r.data!);
              else toast.error(r.error);
            });
          }}
        >
          <Input type="file" name="file" accept=".csv" required className="max-w-sm" />
          <Button type="submit" variant="outline" disabled={pending}>
            Preview
          </Button>
        </form>
      </Card>
      {preview && (
        <Card>
          <div className="flex items-center justify-between border-b p-3 text-sm">
            <span>
              {preview.rows.length} rows · {good} ready · {preview.rows.length - good} with problems (skipped)
            </span>
            <Button
              disabled={pending || good === 0}
              onClick={() =>
                start(async () => {
                  const r = await commitPaymentsCsv(preview.raw);
                  if (r.ok) {
                    toast.success(r.message);
                    router.push("/transactions");
                  } else toast.error(r.error);
                })
              }
            >
              Import {good} payment(s)
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-50">
                <tr>
                  {["Line", "Result", "Transaction", "Date", "Amount", "OR", "Method", "Problems"].map((h) => (
                    <th key={h} className="px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.ok ? "" : "bg-red-50"}>
                    <td className="px-2 py-1">{r.line}</td>
                    <td className="px-2 py-1">
                      <Badge variant={r.ok ? "success" : "danger"}>{r.ok ? "ok" : "skip"}</Badge>
                    </td>
                    <td className="px-2 py-1">{r.raw.transaction_code}</td>
                    <td className="px-2 py-1">{r.raw.paid_at}</td>
                    <td className="px-2 py-1 tabular">{r.raw.amount}</td>
                    <td className="px-2 py-1">{r.raw.or_number}</td>
                    <td className="px-2 py-1">{r.raw.method}</td>
                    <td className="px-2 py-1 text-red-700">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
