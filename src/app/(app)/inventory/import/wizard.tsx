"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { previewInventoryImport, commitInventoryImport } from "@/server/actions/import";
import type { PreviewRow } from "@/server/import-inventory";

export function ImportWizard({ developments, today }: { developments: { value: string; label: string }[]; today: string }) {
  const router = useRouter();
  const [devId, setDevId] = React.useState(developments[0]?.value ?? "");
  const [effective, setEffective] = React.useState(today);
  const [preview, setPreview] = React.useState<{ rows: PreviewRow[]; raw: Record<string, string>[] } | null>(null);
  const [pending, start] = React.useTransition();
  const errors = preview?.rows.filter((r) => r.action === "error").length ?? 0;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await previewInventoryImport(fd);
              if (r.ok) setPreview(r.data!);
              else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Development</Label>
            <NativeSelect name="developmentId" value={devId} onChange={(e) => { setDevId(e.target.value); setPreview(null); }}>
              {developments.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>File (.csv / .xlsx)</Label>
            <Input type="file" name="file" accept=".csv,.xlsx" required onChange={() => setPreview(null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Prices effective</Label>
            <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Reading…" : "Preview"}
          </Button>
        </form>
      </Card>
      {preview && (
        <Card>
          <div className="flex items-center justify-between border-b p-3 text-sm">
            <span>
              {preview.rows.length} rows · {preview.rows.filter((r) => r.action === "create").length} new · {preview.rows.filter((r) => r.action === "update").length} updates ·{" "}
              {preview.rows.filter((r) => r.priceChange).length} price changes · <span className={errors ? "font-medium text-red-700" : ""}>{errors} errors</span>
            </span>
            <Button
              disabled={pending || errors > 0 || preview.rows.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await commitInventoryImport({ developmentId: devId, raw: preview.raw, effectiveDate: effective });
                  if (r.ok) {
                    toast.success(r.message);
                    router.push(`/inventory?developmentId=${devId}`);
                  } else toast.error(r.error);
                })
              }
            >
              Import {preview.rows.length} rows
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-50">
                <tr>
                  <th className="px-2 py-1 text-left">Line</th>
                  <th className="px-2 py-1 text-left">Result</th>
                  <th className="px-2 py-1 text-left">Kind</th>
                  <th className="px-2 py-1 text-left">Code</th>
                  <th className="px-2 py-1 text-left">Section</th>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-right">Price</th>
                  <th className="px-2 py-1 text-left">Problems</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.action === "error" ? "bg-red-50" : ""}>
                    <td className="px-2 py-1">{r.line}</td>
                    <td className="px-2 py-1">
                      <Badge variant={r.action === "error" ? "danger" : r.action === "create" ? "success" : "info"}>{r.action}</Badge>
                      {r.priceChange && <Badge variant="warning" className="ml-1">price</Badge>}
                    </td>
                    <td className="px-2 py-1">{r.raw.kind || "UNIT"}</td>
                    <td className="px-2 py-1 font-medium">{r.raw.code}</td>
                    <td className="px-2 py-1">{r.raw.section_code}</td>
                    <td className="px-2 py-1">{r.raw.unit_type || r.raw.parking_type}</td>
                    <td className="px-2 py-1 text-right tabular">{r.raw.price}</td>
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
