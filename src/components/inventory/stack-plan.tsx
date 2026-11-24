"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inventoryStatusColors } from "@/config/brand";
import { formatPeso } from "@/lib/money";
import { cn } from "@/lib/utils";
import { label } from "@/lib/labels";
import type { ItemVM } from "@/server/queries/inventory";
import { ItemActions, type ItemPerms } from "./item-actions";

export interface StackSection {
  id: string;
  name: string;
  kind: string;
  rowLabel: string;
  rows: { label: string; cells: ItemVM[] }[];
}

export function StackPlan({ sections, perms, me, leadOptions, today }: { sections: StackSection[]; perms: ItemPerms; me: string; leadOptions: { value: string; label: string }[]; today: string }) {
  const [selected, setSelected] = React.useState<ItemVM | null>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(inventoryStatusColors).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ background: v.bg, border: `1px solid ${v.text}` }} /> {v.label}
          </span>
        ))}
      </div>
      <div className="space-y-6">
        {sections.map((s) => (
          <div key={s.id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-semibold">{s.name}</h3>
              <span className="text-xs text-muted-foreground">{label(s.kind)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1">
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.label}>
                      <th className="sticky left-0 bg-white pr-2 text-right text-xs font-medium text-stone-500 whitespace-nowrap">
                        {s.rowLabel} {r.label}
                      </th>
                      {r.cells.map((c) => {
                        const col = inventoryStatusColors[c.status];
                        return (
                          <td key={c.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(c)}
                              className={cn("flex h-12 w-20 flex-col items-center justify-center rounded border text-[11px] leading-tight transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring")}
                              style={{ background: col.bg, color: col.text, borderColor: col.text + "55" }}
                              title={`${c.code} · ${col.label} · ${formatPeso(c.priceCents)}`}
                            >
                              <span className="font-semibold">{c.code.split("-").pop()}</span>
                              <span className="opacity-80">{c.kind === "UNIT" ? (c.model?.slice(0, 10) ?? label(c.type)) : label(c.type)}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent side="right">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.code}</DialogTitle>
                <DialogDescription>
                  {selected.developmentName}
                  {selected.sectionName ? ` · ${selected.sectionName}` : ""}
                </DialogDescription>
              </DialogHeader>
              <QuickDetails item={selected} />
              <ItemActions item={selected} perms={perms} me={me} leadOptions={leadOptions} today={today} onDone={() => setSelected(null)} />
              <Link href={selected.kind === "UNIT" ? `/inventory/units/${selected.id}` : `/inventory/parking/${selected.id}`} className="text-sm text-brand-700 hover:underline">
                Open full details & history →
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuickDetails({ item }: { item: ItemVM }) {
  const col = inventoryStatusColors[item.status];
  const rows: [string, React.ReactNode][] = [
    ["Status", <span key="s" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: col.bg, color: col.text }}>{col.label}</span>],
    ["List price", <b key="p" className="tabular">{formatPeso(item.priceCents)}</b>],
    ["Type", label(item.type) + (item.model ? ` · ${item.model}` : "")],
  ];
  if (item.kind === "UNIT") {
    rows.push(["Location", item.floor !== null ? `Floor ${item.floor}` : [item.block && `Block ${item.block}`, item.lot && `Lot ${item.lot}`].filter(Boolean).join(", ") || "—"]);
    rows.push(["Area", [item.floorArea && `${item.floorArea} sqm floor`, item.lotArea && `${item.lotArea} sqm lot`].filter(Boolean).join(" · ") || "—"]);
    if (item.bedrooms !== null) rows.push(["Bedrooms", String(item.bedrooms)]);
  } else rows.push(["Level", item.level ?? "—"]);
  if (item.daysAvailable !== null) rows.push(["Days available", String(item.daysAvailable)]);
  if (item.hold)
    rows.push([
      "Hold",
      `${item.hold.placedBy}${item.hold.party ? ` for ${item.hold.party}` : ""}${item.hold.broker ? ` (broker: ${item.hold.broker})` : ""} — expires ${new Date(item.hold.expiresAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}`,
    ]);
  if (item.transaction)
    rows.push([
      "Transaction",
      <Link key="t" href={`/transactions/${item.transaction.id}`} className="text-brand-700 hover:underline">
        {item.transaction.code} · {item.transaction.client}
        {item.transaction.broker ? ` · broker ${item.transaction.broker}` : ""}
      </Link>,
    ]);
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="col-span-2">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
