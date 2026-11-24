"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Checkbox } from "@/components/ui/input";
import { saveAutomationRule } from "@/server/actions/marketing";
import { TRIGGERS, ACTION_TYPES } from "@/domain/automation/rules";

type Cond = { field: string; op: string; value: string };
type Act = { type: string; params: Record<string, string> };
export interface RuleValue {
  id?: string;
  name: string;
  trigger: string;
  enabled: boolean;
  description: string;
  conditions: Cond[];
  actions: Act[];
}

const PARAM_KEYS: Record<string, string[]> = { create_task: ["title", "dueInHours", "assignTo", "priority"], notify: ["title", "body", "to"], assign_owner: ["userId"], enroll_sequence: ["sequenceId"] };

/** Trigger → conditions → actions builder for custom automation rules. */
export function RuleBuilder({ initial, trigger, sequences, users }: { initial?: RuleValue; trigger: React.ReactNode; sequences: { value: string; label: string }[]; users: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<RuleValue>(initial ?? { name: "", trigger: "lead.created", enabled: true, description: "", conditions: [], actions: [{ type: "create_task", params: { title: "", dueInHours: "24", assignTo: "owner", priority: "MEDIUM" } }] });
  const [pending, start] = React.useTransition();
  const fields = TRIGGERS[v.trigger]?.fields ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit rule" : "New automation rule"}</DialogTitle>
          <DialogDescription>When the trigger happens and all conditions match, the actions run (in the background worker).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <NativeSelect value={v.trigger} onChange={(e) => setV({ ...v, trigger: e.target.value, conditions: [] })}>
              {Object.entries(TRIGGERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label>Conditions (all must match)</Label>
            <Button size="sm" variant="outline" onClick={() => setV({ ...v, conditions: [...v.conditions, { field: fields[0] ?? "", op: "eq", value: "" }] })}>
              <Plus /> Condition
            </Button>
          </div>
          {v.conditions.map((c, i) => (
            <div key={i} className="mb-1 flex items-center gap-2">
              <NativeSelect className="w-56" value={c.field} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </NativeSelect>
              <NativeSelect className="w-28" value={c.op} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>
                {["eq", "neq", "in", "contains", "gt", "lt"].map((o) => <option key={o} value={o}>{o}</option>)}
              </NativeSelect>
              <Input placeholder="value (comma-separated for in)" value={c.value} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" aria-label="Remove condition" onClick={() => setV({ ...v, conditions: v.conditions.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label>Actions</Label>
            <Button size="sm" variant="outline" onClick={() => setV({ ...v, actions: [...v.actions, { type: "notify", params: { title: "", to: "owner" } }] })}>
              <Plus /> Action
            </Button>
          </div>
          {v.actions.map((a, i) => (
            <div key={i} className="mb-2 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <NativeSelect className="w-56" value={a.type} onChange={(e) => setV({ ...v, actions: v.actions.map((x, j) => (j === i ? { type: e.target.value, params: {} } : x)) })}>
                  {Object.entries(ACTION_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                </NativeSelect>
                <Button size="icon" variant="ghost" aria-label="Remove action" onClick={() => setV({ ...v, actions: v.actions.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PARAM_KEYS[a.type].map((p) => {
                  const set = (val: string) => setV({ ...v, actions: v.actions.map((x, j) => (j === i ? { ...x, params: { ...x.params, [p]: val } } : x)) });
                  if (p === "sequenceId")
                    return (
                      <NativeSelect key={p} value={a.params[p] ?? ""} onChange={(e) => set(e.target.value)}>
                        <option value="">Select sequence…</option>
                        {sequences.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </NativeSelect>
                    );
                  if (p === "userId")
                    return (
                      <NativeSelect key={p} value={a.params[p] ?? ""} onChange={(e) => set(e.target.value)}>
                        <option value="">Select user…</option>
                        {users.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </NativeSelect>
                    );
                  return <Input key={p} placeholder={p === "to" || p === "assignTo" ? `${p}: owner | handler | role:SALES_MANAGER` : p} value={a.params[p] ?? ""} onChange={(e) => set(e.target.value)} />;
                })}
              </div>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> Enabled
        </label>
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveAutomationRule({ ...v, id: v.id ?? null } as any);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error + (r.fieldErrors ? " " + Object.entries(r.fieldErrors).map(([k, m]) => `${k}: ${m?.join(", ")}`).join("; ") : ""));
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
