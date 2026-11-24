import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader, StatusBadge, EmptyState } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConfirmAction } from "@/components/app/confirm-action";
import { RuleEditor } from "@/components/commissions/rule-editor";
import { deleteCommissionRule } from "@/server/actions/commissions";
import { developmentOptions, brokerageOptions } from "@/server/queries/options";

export const metadata = { title: "Commission rules" };

export default async function CommissionRulesPage() {
  await requirePermission("commissions:manage_rules");
  const [rules, developments, brokerages] = await Promise.all([
    prisma.commissionRule.findMany({ include: { development: { select: { name: true } }, brokerage: { select: { name: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    developmentOptions(),
    brokerageOptions(),
  ]);
  return (
    <>
      <PageHeader
        title="Commission rules"
        description="The most specific active rule applies (development + brokerage → brokerage → development → all). A broker's personal override rate replaces the rule's rate. Rules apply to new reservations; existing ledgers keep their snapshot."
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        actions={<RuleEditor developments={developments} brokerages={brokerages} trigger={<Button size="sm">New rule</Button>} />}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Rule</TH>
              <TH>Scope</TH>
              <TH>Rate</TH>
              <TH>Split (brokerage / agent)</TH>
              <TH>Tranches</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rules.map((r) => {
              const tranches = r.tranches as any[];
              return (
                <TR key={r.id} className={r.active ? "" : "opacity-50"}>
                  <TD className="font-medium">
                    {r.name} {!r.active && <StatusBadge status="DEACTIVATED" label="Inactive" />}
                  </TD>
                  <TD className="text-xs">
                    {r.development?.name ?? "All developments"}
                    <div className="text-muted-foreground">{r.brokerage?.name ?? "All brokerages"}</div>
                  </TD>
                  <TD className="text-xs">
                    {r.ratePct}% of {r.basis}
                  </TD>
                  <TD className="text-xs">
                    {r.brokerageSharePct}% / {r.agentSharePct}%
                  </TD>
                  <TD className="text-xs">{tranches.map((t) => `${t.pct}% ${t.label}`).join(" · ")}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <RuleEditor
                        developments={developments}
                        brokerages={brokerages}
                        trigger={<Button variant="ghost" size="sm">Edit</Button>}
                        initial={{
                          id: r.id,
                          name: r.name,
                          developmentId: r.developmentId ?? "",
                          brokerageId: r.brokerageId ?? "",
                          ratePct: String(r.ratePct),
                          basis: r.basis,
                          brokerageSharePct: String(r.brokerageSharePct),
                          agentSharePct: String(r.agentSharePct),
                          active: r.active,
                          tranches: tranches.map((t) => ({ label: t.label, pct: String(t.pct), milestoneType: t.milestoneType, milestoneValue: t.milestoneValue != null ? String(t.milestoneValue) : "" })),
                        }}
                      />
                      <ConfirmAction action={deleteCommissionRule} args={{ id: r.id }} title={`Delete ${r.name}?`} description="Rules already used by ledgers are deactivated instead." destructive variant="ghost">
                        Delete
                      </ConfirmAction>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {rules.length === 0 && <EmptyState title="No rules yet" description="Without rules, the brokerage's default rate (or the settings fallback) applies with default tranches." />}
      </Card>
    </>
  );
}
