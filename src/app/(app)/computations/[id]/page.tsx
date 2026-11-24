import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, DL } from "@/components/app/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComputationView } from "@/components/transactions/computation-view";
import { ComposeEmailButton } from "@/components/app/compose-email";
import type { ComputationResult } from "@/domain/pricing/computation";
import { formatDateTime } from "@/lib/format";
import { fullName } from "@/lib/utils";
import { brand } from "@/config/brand";

export default async function ComputationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("computations:view");
  const { id } = await params;
  const c = await prisma.sampleComputation.findUnique({ where: { id }, include: { lead: true, client: true, development: true, unit: true, parkingSlot: true } });
  if (!c) notFound();
  const contact = c.client ?? c.lead;
  const expired = c.validUntil < new Date();
  const inputs = c.inputs as any;
  return (
    <>
      <PageHeader
        title={`Sample computation v${c.version}`}
        description={
          <span className="flex items-center gap-2">
            {contact ? fullName(contact) : ""} · {c.development.name} · {(inputs.items ?? []).map((i: any) => i.code).join(" + ")}
            {expired ? <Badge variant="danger">Expired</Badge> : <Badge variant="success">Valid until {formatDateTime(c.validUntil)}</Badge>}
          </span>
        }
        breadcrumbs={c.leadId ? [{ href: `/pipeline/leads/${c.leadId}?tab=computations`, label: "Lead" }] : c.clientId ? [{ href: `/clients/${c.clientId}`, label: "Client" }] : undefined}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/computations/${c.id}/pdf`} target="_blank" rel="noopener">
                <FileDown /> PDF
              </a>
            </Button>
            {can(user, "computations:send") && contact?.email && (
              <ComposeEmailButton
                label="Email PDF"
                to={[contact.email]}
                leadId={c.leadId ?? undefined}
                clientId={c.clientId ?? undefined}
                computationId={c.id}
                defaultSubject={`${brand.name} sample computation — ${c.development.name}`}
                defaultBody={`Dear ${contact.firstName},\n\nThank you for your interest in ${c.development.name}. Attached is the sample computation we discussed. Prices are valid until ${formatDateTime(c.validUntil)}.\n\nPlease let me know if you have any questions.\n\nRegards,\n${user.name}`}
              />
            )}
            {can(user, "transactions:create") && !expired && (
              <Button asChild size="sm">
                <Link href={`/transactions/new?${c.leadId ? `leadId=${c.leadId}` : `clientId=${c.clientId}`}${c.unitId ? `&unitId=${c.unitId}` : ""}${c.parkingSlotId ? `&parkingSlotId=${c.parkingSlotId}` : ""}&paymentSchemeId=${c.paymentSchemeId}`}>Reserve this</Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4">
            <ComputationView c={c.result as unknown as ComputationResult} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DL
              cols={2}
              items={[
                ["Created", formatDateTime(c.createdAt)],
                ["Valid until", formatDateTime(c.validUntil)],
                ["Sent", c.sentAt ? formatDateTime(c.sentAt) : "Not yet"],
                ["Scheme", inputs.scheme?.name],
              ]}
            />
            <p className="mt-4 text-xs text-muted-foreground">{inputs.disclaimer}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
