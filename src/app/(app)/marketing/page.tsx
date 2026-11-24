import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireAnyPermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, LinkTabs, StatusBadge, EmptyState } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { saveCampaign, deleteCampaign, saveTemplate, deleteTemplate } from "@/server/actions/marketing";
import { picklist } from "@/lib/picklists";
import { developmentOptions } from "@/server/queries/options";
import { formatPeso, n } from "@/lib/money";
import { formatDay, dayInput, formatPct } from "@/lib/format";
import { MERGE_FIELDS } from "@/domain/automation/rules";
import type { FieldDef } from "@/components/app/entity-form";

export const metadata = { title: "Marketing" };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAnyPermission(["campaigns:view", "sequences:view"]);
  const tab = (await searchParams).tab ?? (can(user, "campaigns:view") ? "campaigns" : "sequences");
  const tabs = [
    ...(can(user, "campaigns:view") ? [{ key: "campaigns", label: "Campaigns" }] : []),
    ...(can(user, "sequences:view") ? [{ key: "sequences", label: "Email sequences" }, { key: "templates", label: "Email templates" }] : []),
    ...(can(user, "campaigns:view") ? [{ key: "webform", label: "Web form" }] : []),
  ];
  return (
    <>
      <PageHeader title="Marketing" />
      <LinkTabs tabs={tabs} active={tab} baseHref="/marketing" />
      {tab === "campaigns" && <Campaigns canManage={can(user, "campaigns:manage")} />}
      {tab === "sequences" && <Sequences canManage={can(user, "sequences:manage")} />}
      {tab === "templates" && <Templates canManage={can(user, "sequences:manage")} />}
      {tab === "webform" && <WebForm />}
    </>
  );
}

async function Campaigns({ canManage }: { canManage: boolean }) {
  const [campaigns, channels, devs, wonStage] = await Promise.all([
    prisma.campaign.findMany({ where: { deletedAt: null }, include: { development: { select: { name: true } }, _count: { select: { leads: { where: { deletedAt: null } } } } }, orderBy: [{ active: "desc" }, { startDate: "desc" }] }),
    picklist("CAMPAIGN_CHANNEL"),
    developmentOptions(),
    prisma.pipelineStage.findFirst({ where: { isWon: true } }),
  ]);
  const won = await prisma.lead.groupBy({ by: ["campaignId"], where: { deletedAt: null, stageId: wonStage?.id ?? "-", campaignId: { in: campaigns.map((c) => c.id) } }, _count: true });
  const wonBy = new Map(won.map((w) => [w.campaignId, w._count]));
  const fields: FieldDef[] = [
    { name: "id", label: "", type: "hidden" },
    { name: "name", label: "Name", required: true },
    { name: "code", label: "Code (utm_campaign)", required: true, placeholder: "ctr-holiday-2026" },
    { name: "channel", label: "Channel", type: "select", options: channels, required: true },
    { name: "developmentId", label: "Development", type: "select", options: devs, emptyOption: "All" },
    { name: "budget", label: "Budget", type: "money", required: true },
    { name: "startDate", label: "Start", type: "date" },
    { name: "endDate", label: "End", type: "date" },
    { name: "description", label: "Description", type: "textarea", span: 2 },
    { name: "active", label: "Active", type: "checkbox" },
  ];
  return (
    <Card>
      <div className="flex justify-end border-b p-3">{canManage && <FormDialog title="New campaign" schema="campaign" fields={fields} action={saveCampaign} wide defaultValues={{ active: true, budget: 0 }} />}</div>
      <Table>
        <THead>
          <TR>
            <TH>Campaign</TH>
            <TH>Channel</TH>
            <TH>Period</TH>
            <TH className="text-right">Budget</TH>
            <TH className="text-right">Leads</TH>
            <TH className="text-right">Reservations</TH>
            <TH className="text-right">Cost / lead</TH>
            <TH className="text-right">Cost / reservation</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {campaigns.map((c) => {
            const leads = c._count.leads;
            const res = wonBy.get(c.id) ?? 0;
            return (
              <TR key={c.id} className={c.active ? "" : "opacity-60"}>
                <TD>
                  <Link href={`/pipeline?view=list&campaignId=${c.id}`} className="font-medium text-brand-800 hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.code} · {c.development?.name ?? "All developments"}
                  </div>
                </TD>
                <TD className="text-xs">{channels.find((x) => x.value === c.channel)?.label ?? c.channel}</TD>
                <TD className="text-xs">
                  {formatDay(c.startDate)} – {formatDay(c.endDate)}
                </TD>
                <TD className="text-right tabular">{formatPeso(c.budgetCents)}</TD>
                <TD className="text-right tabular">{leads}</TD>
                <TD className="text-right tabular">{res}</TD>
                <TD className="text-right tabular">{leads ? formatPeso(Math.round(n(c.budgetCents) / leads)) : "—"}</TD>
                <TD className="text-right tabular">{res ? formatPeso(Math.round(n(c.budgetCents) / res)) : "—"}</TD>
                <TD className="text-right">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <FormDialog title="Edit campaign" triggerLabel="Edit" triggerVariant="ghost" schema="campaign" fields={fields} action={saveCampaign} wide defaultValues={{ ...c, budget: n(c.budgetCents) / 100, startDate: dayInput(c.startDate), endDate: dayInput(c.endDate) }} />
                      <ConfirmAction action={deleteCampaign} args={{ id: c.id }} title={`Remove ${c.name}?`} variant="ghost" destructive>
                        Remove
                      </ConfirmAction>
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {campaigns.length === 0 && <EmptyState title="No campaigns" />}
    </Card>
  );
}

async function Sequences({ canManage }: { canManage: boolean }) {
  const seqs = await prisma.emailSequence.findMany({ where: { deletedAt: null }, include: { steps: true, _count: { select: { enrollments: true } } }, orderBy: { name: "asc" } });
  const stats = await Promise.all(
    seqs.map(async (s) => {
      const [active, sent, replied, failed] = await Promise.all([
        prisma.sequenceEnrollment.count({ where: { sequenceId: s.id, status: "ACTIVE" } }),
        prisma.sequenceSend.count({ where: { enrollment: { sequenceId: s.id }, status: "SENT" } }),
        prisma.sequenceSend.count({ where: { enrollment: { sequenceId: s.id }, repliedAt: { not: null } } }),
        prisma.sequenceSend.count({ where: { enrollment: { sequenceId: s.id }, status: "FAILED" } }),
      ]);
      return { active, sent, replied, failed };
    }),
  );
  return (
    <Card>
      <div className="flex justify-end border-b p-3">
        {canManage && (
          <Button asChild size="sm">
            <Link href="/marketing/sequences/new">New sequence</Link>
          </Button>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Sequence</TH>
            <TH>Steps</TH>
            <TH className="text-right">Enrolled</TH>
            <TH className="text-right">Active</TH>
            <TH className="text-right">Emails sent</TH>
            <TH className="text-right">Replies</TH>
            <TH className="text-right">Reply rate</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {seqs.map((s, i) => (
            <TR key={s.id}>
              <TD>
                <Link href={`/marketing/sequences/${s.id}`} className="font-medium text-brand-800 hover:underline">
                  {s.name}
                </Link>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </TD>
              <TD>{s.steps.length}</TD>
              <TD className="text-right tabular">{s._count.enrollments}</TD>
              <TD className="text-right tabular">{stats[i].active}</TD>
              <TD className="text-right tabular">
                {stats[i].sent}
                {stats[i].failed ? <span className="text-red-700"> ({stats[i].failed} failed)</span> : null}
              </TD>
              <TD className="text-right tabular">{stats[i].replied}</TD>
              <TD className="text-right tabular">{stats[i].sent ? formatPct((stats[i].replied / stats[i].sent) * 100) : "—"}</TD>
              <TD>
                <StatusBadge status={s.active ? "ACTIVE" : "DEACTIVATED"} label={s.active ? "Active" : "Paused"} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {seqs.length === 0 && <EmptyState title="No sequences" />}
      <p className="p-3 text-xs text-muted-foreground">Emails are sent from the lead owner's Outlook. Open tracking isn't available through Microsoft Graph; replies are detected by the mailbox capture job.</p>
    </Card>
  );
}

async function Templates({ canManage }: { canManage: boolean }) {
  const templates = await prisma.emailTemplate.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const fields: FieldDef[] = [
    { name: "id", label: "", type: "hidden" },
    { name: "name", label: "Template name", required: true, span: 2 },
    { name: "subject", label: "Subject", required: true, span: 2 },
    { name: "bodyHtml", label: "Body (HTML allowed)", type: "textarea", required: true, span: 2, help: `Merge fields: ${MERGE_FIELDS.map((f) => `{{${f}}}`).join(" ")}` },
  ];
  return (
    <Card>
      <div className="flex justify-end border-b p-3">{canManage && <FormDialog title="New email template" schema="emailTemplate" fields={fields} action={saveTemplate} wide />}</div>
      <Table>
        <TBody>
          {templates.map((t) => (
            <TR key={t.id}>
              <TD>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.subject}</div>
              </TD>
              <TD className="text-right">
                {canManage && (
                  <div className="flex justify-end gap-1">
                    <FormDialog title="Edit template" triggerLabel="Edit" triggerVariant="ghost" schema="emailTemplate" fields={fields} action={saveTemplate} wide defaultValues={t} />
                    <ConfirmAction action={deleteTemplate} args={{ id: t.id }} title={`Remove ${t.name}?`} variant="ghost" destructive>
                      Remove
                    </ConfirmAction>
                  </div>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {templates.length === 0 && <EmptyState title="No templates" />}
    </Card>
  );
}

async function WebForm() {
  const h = await headers();
  const base = process.env.APP_URL || `https://${h.get("host")}`;
  const iframe = `<iframe src="${base}/f/lead?development=CTR&utm_source=website&utm_medium=organic&utm_campaign=" style="width:100%;max-width:480px;height:720px;border:0" title="Citrineland inquiry form"></iframe>`;
  const js = `fetch("${base}/api/public/leads", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName, lastName, email, mobile,           // mobile: +63 9XX XXX XXXX
    developmentCode: "CTR", message,
    privacyConsent: true,                         // required (RA 10173)
    captchaToken,                                 // Cloudflare Turnstile token
    utm_source, utm_medium, utm_campaign, utm_term, utm_content
  })
});`;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Embed the hosted form (recommended)</CardTitle>
          <CardDescription>Paste on the Citrineland website. Pass UTM parameters in the URL; utm_campaign is matched to a campaign code.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded bg-stone-900 p-3 text-xs text-stone-100">{iframe}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Allowed parent sites are set with <code>PUBLIC_FORM_FRAME_ANCESTORS</code>. Preview:{" "}
            <a className="text-brand-700 underline" href="/f/lead" target="_blank">
              /f/lead
            </a>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Or post from your own form</CardTitle>
          <CardDescription>POST /api/public/leads — rate-limited per IP, CAPTCHA-protected, CORS limited to allowed origins (Settings → Web lead form).</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded bg-stone-900 p-3 text-xs text-stone-100">{js}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            A hidden honeypot field named <code>website</code> must stay empty. Submissions matching an existing lead (email or mobile) are added to that lead&apos;s timeline instead of creating a duplicate. New leads trigger the &ldquo;new lead&rdquo; automation (owner assignment, first-contact task).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
