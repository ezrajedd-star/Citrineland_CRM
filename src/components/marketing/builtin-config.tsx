"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { saveBuiltinConfig } from "@/server/actions/marketing";

type Opt = { value: string; label: string };

/** Small per-automation config editors (timings, assignment pool). */
export function BuiltinConfig({ k, config, users, developments }: { k: string; config: any; users: Opt[]; developments: Opt[] }) {
  const router = useRouter();
  const [c, setC] = React.useState<any>(config);
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      const r = await saveBuiltinConfig({ key: k, config: c });
      if (r.ok) {
        toast.success("Saved");
        router.refresh();
      } else toast.error(r.error);
    });
  const num = (field: string, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="w-28" inputMode="numeric" value={c[field] ?? ""} onChange={(e) => setC({ ...c, [field]: Number(e.target.value) || 0 })} />
    </div>
  );
  let body: React.ReactNode = null;
  if (k === "lead_assignment")
    body = (
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Strategy</Label>
            <NativeSelect value={c.strategy} onChange={(e) => setC({ ...c, strategy: e.target.value })}>
              <option value="round_robin">Round-robin</option>
              <option value="by_development">By development (fallback round-robin)</option>
            </NativeSelect>
          </div>
          {num("taskDueHours", "First-contact task due (hours)")}
        </div>
        <div>
          <Label className="text-xs">Round-robin pool (none selected = everyone with leads:update)</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {users.map((u) => (
              <label key={u.value} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                <input type="checkbox" className="accent-brand-600" checked={(c.userIds ?? []).includes(u.value)} onChange={(e) => setC({ ...c, userIds: e.target.checked ? [...(c.userIds ?? []), u.value] : (c.userIds ?? []).filter((x: string) => x !== u.value) })} />
                {u.label}
              </label>
            ))}
          </div>
        </div>
        {c.strategy === "by_development" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {developments.map((d) => (
              <div key={d.value} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate">{d.label}</span>
                <NativeSelect value={c.developmentOwners?.[d.value] ?? ""} onChange={(e) => setC({ ...c, developmentOwners: { ...(c.developmentOwners ?? {}), [d.value]: e.target.value } })}>
                  <option value="">Round-robin</option>
                  {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </NativeSelect>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  else if (k === "lead_inactivity") body = num("days", "Days without activity");
  else if (k === "hold_expiry") body = num("hoursBefore", "Warn hours before expiry");
  else if (k === "payment_reminders") body = num("daysBefore", "Days before due date");
  else if (k === "broker_expiry")
    body = (
      <div className="space-y-1">
        <Label className="text-xs">Notify days before expiry (comma-separated)</Label>
        <Input className="w-40" value={(c.days ?? []).join(", ")} onChange={(e) => setC({ ...c, days: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) })} />
      </div>
    );
  if (!body) return null;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-3">
      {body}
      <Button size="sm" variant="outline" disabled={pending} onClick={save}>
        Save
      </Button>
    </div>
  );
}
