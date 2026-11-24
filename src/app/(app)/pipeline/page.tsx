import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, Pagination, EmptyState } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { PipelineBoard } from "@/components/pipeline/board";
import { saveLead } from "@/server/actions/crm";
import { leadFields } from "@/components/forms/crm-fields";
import { leadScope } from "@/server/leads";
import { picklist, picklistLabel } from "@/lib/picklists";
import { userOptions, brokerOptions, developmentOptions, campaignOptions, stageOptions } from "@/server/queries/options";
import { formatPesoCompact } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { formatPhMobile } from "@/lib/normalize";
import { fullName, cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("leads:view");
  const params = await searchParams;
  const view = sp(params, "view") ?? "board";
  const [sources, campaigns, developments, users, brokers, stages, lostReasons, sourceLabels] = await Promise.all([
    picklist("LEAD_SOURCE"),
    campaignOptions(),
    developmentOptions(),
    userOptions(),
    brokerOptions(),
    prisma.pipelineStage.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    picklist("LOST_REASON"),
    picklistLabel("LEAD_SOURCE"),
  ]);
  const minAge = Number(sp(params, "minAge") ?? 0);
  const stalledOnly = sp(params, "stalled") === "1";
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...leadScope(user),
    ...(sp(params, "developmentId") ? { developments: { some: { id: sp(params, "developmentId") } } } : {}),
    ...(sp(params, "brokerId") ? { brokerId: sp(params, "brokerId") } : {}),
    ...(sp(params, "ownerId") ? { ownerId: sp(params, "ownerId") === "none" ? null : sp(params, "ownerId") } : {}),
    ...(sp(params, "source") ? { sourceCode: sp(params, "source") } : {}),
    ...(sp(params, "stageId") ? { stageId: sp(params, "stageId") } : {}),
    ...(sp(params, "campaignId") ? { campaignId: sp(params, "campaignId") } : {}),
    ...(minAge > 0 ? { stageChangedAt: { lte: new Date(Date.now() - minAge * 86_400_000) } } : {}),
    ...(sp(params, "q")
      ? {
          OR: [
            { firstName: { contains: sp(params, "q"), mode: "insensitive" } },
            { lastName: { contains: sp(params, "q"), mode: "insensitive" } },
            { email: { contains: sp(params, "q"), mode: "insensitive" } },
            { mobile: { contains: (sp(params, "q") ?? "").replace(/\D/g, "").slice(-10) || "∅" } },
          ],
        }
      : {}),
  };
  const filters = (
    <FilterBar
      basePath="/pipeline"
      values={params}
      extra={<input type="hidden" name="view" value={view} />}
      filters={[
        { type: "search", name: "q", placeholder: "Name, email, mobile" },
        { type: "select", name: "developmentId", label: "Development", options: developments },
        { type: "select", name: "brokerId", label: "Broker", options: brokers },
        { type: "select", name: "ownerId", label: "Owner", options: [{ value: "none", label: "Unassigned" }, ...users] },
        { type: "select", name: "source", label: "Source", options: sources },
        ...(view === "list" ? [{ type: "select" as const, name: "stageId", label: "Stage", options: stages.map((s) => ({ value: s.id, label: s.name })) }] : []),
        { type: "select", name: "minAge", label: "Stage age", options: [{ value: "7", label: "≥ 7 days" }, { value: "14", label: "≥ 14 days" }, { value: "30", label: "≥ 30 days" }] },
        { type: "select", name: "stalled", label: "Stalled", options: [{ value: "1", label: "Stalled only" }] },
      ]}
    />
  );
  const header = (
    <PageHeader
      title="Pipeline"
      actions={
        <>
          <div className="flex rounded-md border bg-white p-0.5">
            {["board", "list"].map((v) => (
              <Link key={v} href={`/pipeline?${new URLSearchParams({ ...(params as Record<string, string>), view: v }).toString()}`} className={cn("rounded px-3 py-1 text-sm capitalize", view === v && "bg-brand-100 font-medium text-brand-800")}>
                {v}
              </Link>
            ))}
          </div>
          {can(user, "leads:create") && (
            <FormDialog
              title="New lead"
              schema="lead"
              wide
              action={saveLead}
              fields={leadFields({ sources, campaigns, developments, users, brokers, stages: await stageOptions(), isNew: true, canPickBroker: true })}
              defaultValues={{ ownerId: user.id, sourceCode: "BROKER_REFERRAL", developmentIds: [], privacyConsent: false }}
            />
          )}
        </>
      }
    />
  );
  const now = Date.now();
  const days = (d: Date) => Math.floor((now - d.getTime()) / 86_400_000);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const isStalled = (l: { stageId: string; stageChangedAt: Date }) => {
    const s = stageById.get(l.stageId);
    return !!s && !s.isWon && !s.isLost && days(l.stageChangedAt) > s.stalledAfterDays;
  };

  if (view === "board") {
    const visibleStages = stages; // includes won and lost columns
    const PER_COL = 60;
    const perStage = await Promise.all(
      visibleStages.map((s) =>
        prisma.lead.findMany({
          where: { ...where, stageId: s.id, ...(s.isWon || s.isLost ? { stageChangedAt: { gte: new Date(now - 60 * 86_400_000) } } : {}) },
          include: { broker: true, owner: { select: { name: true } }, developments: { select: { code: true } } },
          orderBy: { stageChangedAt: "asc" },
          take: PER_COL,
        }),
      ),
    );
    const counts = await prisma.lead.groupBy({ by: ["stageId"], where, _count: true });
    const cards = perStage
      .flat()
      .filter((l) => !stalledOnly || isStalled(l))
      .map((l) => ({
        id: l.id,
        stageId: l.stageId,
        name: fullName(l),
        broker: l.broker ? fullName(l.broker) : null,
        owner: l.owner?.name ?? null,
        developments: l.developments.map((d) => d.code).join(", "),
        budget: l.budgetMaxCents ? `≤ ${formatPesoCompact(l.budgetMaxCents)}` : null,
        daysInStage: days(l.stageChangedAt),
        source: sourceLabels.get(l.sourceCode) ?? l.sourceCode,
      }));
    return (
      <>
        {header}
        <Card className="mb-4">{filters}</Card>
        <PipelineBoard
          stages={visibleStages.map((s) => ({ id: s.id, name: s.name, color: s.color, probability: s.probability, isWon: s.isWon, isLost: s.isLost, stalledAfterDays: s.stalledAfterDays, total: counts.find((c) => c.stageId === s.id)?._count ?? 0 }))}
          cards={cards}
          lostReasons={lostReasons}
        />
        <p className="text-xs text-muted-foreground">Won and lost columns show the last 60 days. Highlighted cards are stalled (days in stage above the stage&apos;s threshold).</p>
      </>
    );
  }

  const { page, pageSize, skip, take } = pageParams(params, 50);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, include: { broker: true, owner: { select: { name: true } }, stage: true, developments: { select: { code: true } } }, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.lead.count({ where }),
  ]);
  const list = stalledOnly ? rows.filter(isStalled) : rows;
  return (
    <>
      {header}
      <Card>
        {filters}
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Stage</TH>
              <TH>Developments</TH>
              <TH>Broker of record</TH>
              <TH>Owner</TH>
              <TH>Source</TH>
              <TH className="text-right">In stage</TH>
              <TH>Last activity</TH>
            </TR>
          </THead>
          <TBody>
            {list.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Link href={`/pipeline/leads/${l.id}`} className="font-medium text-brand-800 hover:underline">
                    {fullName(l)}
                  </Link>
                  <div className="text-xs text-muted-foreground">{[formatPhMobile(l.mobile), l.email].filter((x) => x && x !== "—").join(" · ")}</div>
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: l.stage.color }} />
                    {l.stage.name}
                  </span>
                </TD>
                <TD className="text-xs">{l.developments.map((d) => d.code).join(", ") || "—"}</TD>
                <TD className="text-xs">{l.broker ? fullName(l.broker) : "Direct"}</TD>
                <TD className="text-xs">{l.owner?.name ?? <span className="text-amber-700">Unassigned</span>}</TD>
                <TD className="text-xs">{sourceLabels.get(l.sourceCode) ?? l.sourceCode}</TD>
                <TD className={cn("text-right text-xs tabular", isStalled(l) && "font-medium text-amber-700")}>
                  {isStalled(l) && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                  {days(l.stageChangedAt)}d
                </TD>
                <TD className="text-xs">{formatDateTime(l.lastActivityAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {list.length === 0 && <EmptyState title="No leads match" />}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/pipeline" />
      </Card>
    </>
  );
}
