"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Checkbox } from "@/components/ui/input";
import { saveCommissionRule } from "@/server/actions/commissions";

type Opt = { value: string; label: string };
type Tranche = { label: string; pct: string; milestoneType: string; milestoneValue: string };
export interface RuleValue {
  id?: string;
  name: string;
  developmentId: string;
  brokerageId: string;
  ratePct: string;
  basis: string;
  brokerageSharePct: string;
  agentSharePct: string;
  active: boolean;
  tranches: Tranche[];
}

const MILESTONES = [
  { value: "RESERVATION", label: "On reservation" },
  { value: "COLLECTED_PCT_TCP", label: "When X% of TCP is collected" },
  { value: "CONTRACT_SIGNED", label: "Contract to Sell signed" },
  { value: "DP_COMPLETE", label: "Down payment complete" },
  { value: "LOAN_TAKEOUT", label: "Loan takeout / balance paid" },
  { value: "FULLY_PAID", label: "Fully paid" },
];

export function RuleEditor({ initial, developments, brokerages, trigger }: { initial?: RuleValue; developments: Opt[]; brokerages: Opt[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const blank: RuleValue = {
    name: "",
    developmentId: "",
    brokerageId: "",
    ratePct: "5",
    basis: "NSP",
    brokerageSharePct: "100",
    agentSharePct: "0",
    active: true,
    tranches: [
      { label: "50% upon 20% of TCP collected", pct: "50", milestoneType: "COLLECTED_PCT_TCP", milestoneValue: "20" },
      { label: "50% upon full down payment", pct: "50", milestoneType: "DP_COMPLETE", milestoneValue: "" },
    ],
  };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<RuleValue>(initial ?? blank);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const upd = (patch: Partial<RuleValue>) => setV({ ...v, ...patch });
  const updT = (i: number, patch: Partial<Tranche>) => upd({ tranches: v.tranches.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const total = v.tranches.reduce((a, t) => a + (Number(t.pct) || 0), 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit commission rule" : "New commission rule"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={v.name} onChange={(e) => upd({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Development</Label>
            <NativeSelect value={v.developmentId} onChange={(e) => upd({ developmentId: e.target.value })}>
              <option value="">All</option>
              {developments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Brokerage</Label>
            <NativeSelect value={v.brokerageId} onChange={(e) => upd({ brokerageId: e.target.value })}>
              <option value="">All</option>
              {brokerages.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Rate %</Label>
            <Input inputMode="decimal" value={v.ratePct} onChange={(e) => upd({ ratePct: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Basis</Label>
            <NativeSelect value={v.basis} onChange={(e) => upd({ basis: e.target.value })}>
              <option value="NSP">Net selling price</option>
              <option value="TCP">Total contract price</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Brokerage share %</Label>
            <Input inputMode="decimal" value={v.brokerageSharePct} onChange={(e) => upd({ brokerageSharePct: e.target.value, agentSharePct: String(100 - (Number(e.target.value) || 0)) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Agent share %</Label>
            <Input inputMode="decimal" value={v.agentSharePct} onChange={(e) => upd({ agentSharePct: e.target.value, brokerageSharePct: String(100 - (Number(e.target.value) || 0)) })} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Release tranches (must total 100% — now {total}%)</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => upd({ tranches: [...v.tranches, { label: "", pct: "", milestoneType: "FULLY_PAID", milestoneValue: "" }] })}>
              <Plus /> Tranche
            </Button>
          </div>
          <div className="space-y-2">
            {v.tranches.map((t, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input className="col-span-4" placeholder="Label" value={t.label} onChange={(e) => updT(i, { label: e.target.value })} />
                <Input className="col-span-1" placeholder="%" value={t.pct} onChange={(e) => updT(i, { pct: e.target.value })} />
                <NativeSelect className="col-span-4" value={t.milestoneType} onChange={(e) => updT(i, { milestoneType: e.target.value })}>
                  {MILESTONES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </NativeSelect>
                <Input className="col-span-2" placeholder={t.milestoneType === "COLLECTED_PCT_TCP" ? "X% of TCP" : "—"} disabled={t.milestoneType !== "COLLECTED_PCT_TCP"} value={t.milestoneValue} onChange={(e) => updT(i, { milestoneValue: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => upd({ tranches: v.tranches.filter((_, j) => j !== i) })} aria-label="Remove tranche">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={v.active} onChange={(e) => upd({ active: e.target.checked })} /> Active
        </label>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{err}</div>}
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCommissionRule({
                  id: v.id ?? null,
                  name: v.name,
                  developmentId: v.developmentId || null,
                  brokerageId: v.brokerageId || null,
                  ratePct: v.ratePct as any,
                  basis: v.basis as any,
                  brokerageSharePct: v.brokerageSharePct as any,
                  agentSharePct: v.agentSharePct as any,
                  active: v.active,
                  tranches: v.tranches.map((t) => ({ label: t.label, pct: t.pct as any, milestoneType: t.milestoneType as any, milestoneValue: t.milestoneValue || null })) as any,
                });
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else setErr(r.error + (r.fieldErrors ? " " + Object.values(r.fieldErrors).flat().join(" ") : ""));
              })
            }
          >
            Save rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
