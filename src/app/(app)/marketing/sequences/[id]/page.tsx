import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, EmptyState } from "@/components/app/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SequenceEditor } from "@/components/marketing/sequence-editor";
import { formatDateTime } from "@/lib/format";
import { fullName } from "@/lib/utils";

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sequences:view");
  const { id } = await params;
  const [templates, stages] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.pipelineStage.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);
  const tOpts = templates.map((t) => ({ value: t.id, label: t.name }));
  const sOpts = stages.map((s) => ({ value: s.id, label: s.name }));
  if (id === "new") {
    return (
      <>
        <PageHeader title="New email sequence" breadcrumbs={[{ href: "/marketing?tab=sequences", label: "Sequences" }]} />
        <SequenceEditor templates={tOpts} stages={sOpts} initial={{ name: "", description: "", active: true, stopOnReply: true, stopOnStageChange: true, triggerStageId: "", steps: [{ delayDays: "0", templateId: tOpts[0]?.value ?? "" }] }} />
      </>
    );
  }
  const seq = await prisma.emailSequence.findFirst({ where: { id, deletedAt: null }, include: { steps: { orderBy: { order: "asc" } } } });
  if (!seq) notFound();
  const enrollments = await prisma.sequenceEnrollment.findMany({ where: { sequenceId: id }, include: { lead: true, _count: { select: { sends: { where: { status: "SENT" } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title={seq.name} breadcrumbs={[{ href: "/marketing?tab=sequences", label: "Sequences" }]} />
      <SequenceEditor
        readOnly={!can(user, "sequences:manage")}
        templates={tOpts}
        stages={sOpts}
        initial={{ id: seq.id, name: seq.name, description: seq.description ?? "", active: seq.active, stopOnReply: seq.stopOnReply, stopOnStageChange: seq.stopOnStageChange, triggerStageId: seq.triggerStageId ?? "", steps: seq.steps.map((s) => ({ delayDays: String(s.delayDays), templateId: s.templateId })) }}
      />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Enrollments</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Status</TH>
              <TH>Emails sent</TH>
              <TH>Next send</TH>
              <TH>Enrolled</TH>
            </TR>
          </THead>
          <TBody>
            {enrollments.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/pipeline/leads/${e.leadId}`} className="text-brand-800 hover:underline">
                    {fullName(e.lead)}
                  </Link>
                </TD>
                <TD>
                  <StatusBadge status={e.status} />
                  {e.stoppedReason && <div className="text-xs text-muted-foreground">{e.stoppedReason}</div>}
                </TD>
                <TD>{e._count.sends}</TD>
                <TD className="text-xs">{formatDateTime(e.nextRunAt)}</TD>
                <TD className="text-xs">{formatDateTime(e.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {enrollments.length === 0 && <EmptyState title="No enrollments yet" />}
      </Card>
    </>
  );
}
