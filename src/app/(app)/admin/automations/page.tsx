import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, EmptyState } from "@/components/app/page";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TR, TD } from "@/components/ui/table";
import { ActionButton, ConfirmAction } from "@/components/app/confirm-action";
import { BuiltinConfig } from "@/components/marketing/builtin-config";
import { RuleBuilder } from "@/components/marketing/rule-builder";
import { toggleBuiltin, deleteAutomationRule } from "@/server/actions/marketing";
import { BUILTINS, type BuiltinKey } from "@/server/automation/engine";
import { TRIGGERS } from "@/domain/automation/rules";
import { userOptions, developmentOptions } from "@/server/queries/options";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const user = await requirePermission("automations:view");
  const canManage = can(user, "automations:manage");
  const [rules, users, devs, sequences, logs] = await Promise.all([
    prisma.automationRule.findMany({ orderBy: { name: "asc" } }),
    userOptions(),
    developmentOptions(),
    prisma.emailSequence.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.automationLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { rule: { select: { name: true } } } }),
  ]);
  const byKey = new Map(rules.filter((r) => r.builtInKey).map((r) => [r.builtInKey!, r]));
  const custom = rules.filter((r) => !r.builtInKey);
  const seqOpts = sequences.map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Automations" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="Built-in automations (toggleable, configurable timings) and custom trigger → conditions → actions rules. All run in the background worker." />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Built-in automations</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {(Object.keys(BUILTINS) as BuiltinKey[]).map((k) => {
            const def = BUILTINS[k];
            const r = byKey.get(k);
            const enabled = r ? r.enabled : true;
            return (
              <div key={k} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{def.name}</div>
                    <div className="text-xs text-muted-foreground">{def.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={enabled ? "ACTIVE" : "DEACTIVATED"} label={enabled ? "On" : "Off"} />
                    {canManage && (
                      <ActionButton action={toggleBuiltin} args={{ key: k, enabled: !enabled }} successMessage="">
                        {enabled ? "Turn off" : "Turn on"}
                      </ActionButton>
                    )}
                  </div>
                </div>
                {canManage && <BuiltinConfig k={k} config={{ ...def.config, ...((r?.config as object) ?? {}) }} users={users} developments={devs} />}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card className="mb-4">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="text-sm font-semibold">Custom rules</div>
            <div className="text-xs text-muted-foreground">Managers can add rules such as “Facebook leads for CTR → notify Marketing Manager”.</div>
          </div>
          {canManage && <RuleBuilder trigger={<Button size="sm">New rule</Button>} sequences={seqOpts} users={users} />}
        </div>
        <Table>
          <TBody>
            {custom.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    When {TRIGGERS[r.trigger]?.label ?? r.trigger}
                    {(r.conditions as any[]).length ? ` if ${(r.conditions as any[]).map((c) => `${c.field} ${c.op} ${c.value}`).join(" and ")}` : ""} → {(r.actions as any[]).map((a) => a.type.replace("_", " ")).join(", ")}
                  </div>
                </TD>
                <TD>
                  <StatusBadge status={r.enabled ? "ACTIVE" : "DEACTIVATED"} label={r.enabled ? "On" : "Off"} />
                </TD>
                <TD className="text-right">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <RuleBuilder
                        trigger={<Button size="sm" variant="ghost">Edit</Button>}
                        sequences={seqOpts}
                        users={users}
                        initial={{ id: r.id, name: r.name, trigger: r.trigger, enabled: r.enabled, description: r.description ?? "", conditions: r.conditions as any, actions: r.actions as any }}
                      />
                      <ConfirmAction action={deleteAutomationRule} args={{ id: r.id }} title={`Delete ${r.name}?`} variant="ghost" destructive>
                        Delete
                      </ConfirmAction>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {custom.length === 0 && <EmptyState title="No custom rules" />}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Last 30 automation log entries</CardDescription>
        </CardHeader>
        <Table>
          <TBody>
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                <TD className="text-xs font-medium">{l.rule.name}</TD>
                <TD>
                  <StatusBadge status={l.status === "ok" ? "DONE" : l.status === "error" ? "ERROR" : "PENDING"} label={l.status} />
                </TD>
                <TD className="text-xs text-muted-foreground">{l.message}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
