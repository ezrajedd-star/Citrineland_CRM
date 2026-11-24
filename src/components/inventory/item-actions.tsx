"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/app/entity-form";
import { ConfirmAction } from "@/components/app/confirm-action";
import { placeHoldAction, releaseHoldAction, blockAction, savePriceChange } from "@/server/actions/inventory";
import type { ItemVM } from "@/server/queries/inventory";

export interface ItemPerms {
  hold: boolean;
  release: boolean;
  block: boolean;
  price: boolean;
  reserve: boolean;
}

type Mode = null | "hold" | "block" | "unblock" | "price";

export function ItemActions({ item, perms, me, leadOptions, today, onDone }: { item: ItemVM; perms: ItemPerms; me: string; leadOptions: { value: string; label: string }[]; today: string; onDone?: () => void }) {
  const [mode, setMode] = React.useState<Mode>(null);
  const canRelease = item.hold && (perms.release || item.hold.placedById === me);
  const ref = item.kind === "UNIT" ? { unitId: item.id } : { parkingSlotId: item.id };
  const done = () => {
    setMode(null);
    onDone?.();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {perms.hold && item.status === "AVAILABLE" && (
          <Button size="sm" variant={mode === "hold" ? "secondary" : "default"} onClick={() => setMode(mode === "hold" ? null : "hold")}>
            Place hold
          </Button>
        )}
        {perms.reserve && (item.status === "AVAILABLE" || item.status === "ON_HOLD") && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/transactions/new?${item.kind === "UNIT" ? "unitId" : "parkingSlotId"}=${item.id}${item.hold ? `&holdId=${item.hold.id}` : ""}`}>Reserve…</Link>
          </Button>
        )}
        {canRelease && item.hold && (
          <ConfirmAction action={releaseHoldAction} args={{ holdId: item.hold.id }} title={`Release hold on ${item.code}?`} description="The item becomes available to everyone again." successMessage="Hold released">
            Release hold
          </ConfirmAction>
        )}
        {perms.block && item.status === "AVAILABLE" && (
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "block" ? null : "block")}>
            Block
          </Button>
        )}
        {perms.block && item.status === "BLOCKED" && (
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "unblock" ? null : "unblock")}>
            Unblock
          </Button>
        )}
        {perms.price && item.status !== "SOLD" && item.status !== "RESERVED" && (
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "price" ? null : "price")}>
            Change price
          </Button>
        )}
      </div>
      {mode === "hold" && (
        <div className="rounded-md border bg-stone-50 p-3">
          <EntityForm
            schema="hold"
            columns={1}
            action={placeHoldAction}
            defaultValues={ref}
            successMessage="Hold placed"
            onSuccess={done}
            submitLabel="Place hold"
            fields={[
              { name: item.kind === "UNIT" ? "unitId" : "parkingSlotId", label: "", type: "hidden" },
              { name: "leadId", label: "For lead", type: "select", options: leadOptions, emptyOption: "— none —" },
              { name: "hours", label: "Hours (blank = default)", type: "number" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </div>
      )}
      {(mode === "block" || mode === "unblock") && (
        <div className="rounded-md border bg-stone-50 p-3">
          <EntityForm
            schema="block"
            columns={1}
            action={blockAction}
            defaultValues={{ kind: item.kind, id: item.id, block: mode === "block" }}
            onSuccess={done}
            submitLabel={mode === "block" ? "Block item" : "Unblock item"}
            fields={[
              { name: "kind", label: "", type: "hidden" },
              { name: "id", label: "", type: "hidden" },
              { name: "reason", label: "Reason", type: "textarea", required: true },
            ]}
          />
        </div>
      )}
      {mode === "price" && (
        <div className="rounded-md border bg-stone-50 p-3">
          <EntityForm
            schema="priceChange"
            columns={1}
            action={savePriceChange}
            defaultValues={{ developmentId: item.developmentId, itemKind: item.kind, itemId: item.id, price: item.priceCents / 100, effectiveDate: today, items: [] }}
            onSuccess={done}
            submitLabel="Save as new price list version"
            fields={[
              { name: "developmentId", label: "", type: "hidden" },
              { name: "itemKind", label: "", type: "hidden" },
              { name: "itemId", label: "", type: "hidden" },
              { name: "price", label: "New list price", type: "money", required: true },
              { name: "effectiveDate", label: "Effective date", type: "date", required: true },
              { name: "notes", label: "Reason / notes", type: "textarea" },
            ]}
          />
        </div>
      )}
    </div>
  );
}
