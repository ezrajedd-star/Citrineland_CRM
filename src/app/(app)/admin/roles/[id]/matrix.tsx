"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action";

export function PermissionMatrix({
  roleId,
  resources,
  actions,
  initial,
  readOnly,
  readOnlyReason,
  descriptions,
  save,
}: {
  roleId: string;
  resources: { key: string; label: string; actions: string[] }[];
  actions: string[];
  initial: string[];
  readOnly: boolean;
  readOnlyReason?: string;
  descriptions: Record<string, string>;
  save: (a: { id: string; permissions: string[] }) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [perms, setPerms] = React.useState(() => new Set(initial));
  const [pending, start] = React.useTransition();
  const dirty = perms.size !== initial.length || initial.some((p) => !perms.has(p));
  const toggle = (p: string) =>
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const toggleRow = (r: { key: string; actions: string[] }) =>
    setPerms((s) => {
      const n = new Set(s);
      const all = r.actions.every((a) => n.has(`${r.key}:${a}`));
      for (const a of r.actions) {
        if (all) n.delete(`${r.key}:${a}`);
        else n.add(`${r.key}:${a}`);
      }
      return n;
    });

  return (
    <Card>
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm text-muted-foreground">{readOnlyReason ?? `${perms.size} permissions selected`}</div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setPerms(new Set(initial))}>
              Reset
            </Button>
            <Button
              size="sm"
              disabled={!dirty || pending}
              onClick={() =>
                start(async () => {
                  const r = await save({ id: roleId, permissions: [...perms] });
                  if (r.ok) {
                    toast.success("Permissions saved");
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-stone-50 text-xs text-stone-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Resource</th>
              {actions.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                  {a.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {resources.map((r) => (
              <tr key={r.key} className="hover:bg-stone-50">
                <td className="px-3 py-2">
                  <button type="button" disabled={readOnly} onClick={() => toggleRow(r)} className="text-left font-medium text-stone-800 hover:text-brand-700 disabled:hover:text-stone-800" title="Toggle row">
                    {r.label}
                  </button>
                  <div className="text-[11px] text-stone-400">{r.key}</div>
                </td>
                {actions.map((a) => {
                  const p = `${r.key}:${a}`;
                  if (!r.actions.includes(a)) return <td key={a} className="bg-stone-50/50" />;
                  return (
                    <td key={a} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={p}
                        title={descriptions[p] ?? p}
                        className="h-4 w-4 accent-brand-600"
                        checked={perms.has(p)}
                        disabled={readOnly}
                        onChange={() => toggle(p)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
