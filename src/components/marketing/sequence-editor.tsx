"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea, Checkbox } from "@/components/ui/input";
import { saveSequence } from "@/server/actions/marketing";

type Opt = { value: string; label: string };
export interface SequenceValue {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  stopOnReply: boolean;
  stopOnStageChange: boolean;
  triggerStageId: string;
  steps: { delayDays: string; templateId: string }[];
}

export function SequenceEditor({ initial, templates, stages, readOnly }: { initial: SequenceValue; templates: Opt[]; stages: Opt[]; readOnly?: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const upd = (p: Partial<SequenceValue>) => setV({ ...v, ...p });
  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input disabled={readOnly} value={v.name} onChange={(e) => upd({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Auto-enroll when a lead enters stage</Label>
            <NativeSelect disabled={readOnly} value={v.triggerStageId} onChange={(e) => upd({ triggerStageId: e.target.value })}>
              <option value="">Manual enrollment only</option>
              {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea disabled={readOnly} rows={2} value={v.description} onChange={(e) => upd({ description: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><Checkbox disabled={readOnly} checked={v.active} onChange={(e) => upd({ active: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-2"><Checkbox disabled={readOnly} checked={v.stopOnReply} onChange={(e) => upd({ stopOnReply: e.target.checked })} /> Stop when the lead replies</label>
            <label className="flex items-center gap-2"><Checkbox disabled={readOnly} checked={v.stopOnStageChange} onChange={(e) => upd({ stopOnStageChange: e.target.checked })} /> Stop when the lead changes stage</label>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Steps (delay is counted from the previous step / enrollment)</Label>
            {!readOnly && (
              <Button type="button" size="sm" variant="outline" onClick={() => upd({ steps: [...v.steps, { delayDays: "3", templateId: templates[0]?.value ?? "" }] })}>
                <Plus /> Step
              </Button>
            )}
          </div>
          <ol className="space-y-2">
            {v.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-14 text-xs text-muted-foreground">Step {i + 1}</span>
                <Input disabled={readOnly} className="w-24" value={s.delayDays} onChange={(e) => upd({ steps: v.steps.map((x, j) => (j === i ? { ...x, delayDays: e.target.value } : x)) })} />
                <span className="text-xs text-muted-foreground">days, then send</span>
                <NativeSelect disabled={readOnly} className="flex-1" value={s.templateId} onChange={(e) => upd({ steps: v.steps.map((x, j) => (j === i ? { ...x, templateId: e.target.value } : x)) })}>
                  {templates.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </NativeSelect>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove step" onClick={() => upd({ steps: v.steps.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </div>
        {!readOnly && (
          <div className="flex justify-end">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveSequence({ ...v, id: v.id ?? null, triggerStageId: v.triggerStageId || null, steps: v.steps.map((s) => ({ delayDays: s.delayDays as any, templateId: s.templateId })) } as any);
                  if (r.ok) {
                    toast.success(r.message);
                    if (r.redirect) router.push(r.redirect);
                    router.refresh();
                  } else toast.error(r.error + (r.fieldErrors ? " " + Object.values(r.fieldErrors).flat().join(" ") : ""));
                })
              }
            >
              Save sequence
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
