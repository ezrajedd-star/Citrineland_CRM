import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, StatusBadge, Pagination, LinkTabs, EmptyState } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { ExpiryBadge } from "@/components/app/expiry";
import { saveBroker, saveBrokerage } from "@/server/actions/crm";
import { brokerFields, brokerageFields } from "@/components/forms/crm-fields";
import { brokerageOptions } from "@/server/queries/options";
import { label, options } from "@/lib/labels";
import { E } from "@/lib/validation/schemas";
import { formatPhMobile } from "@/lib/normalize";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Brokers" };

export default async function BrokersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("brokers:view");
  const params = await searchParams;
  const tab = sp(params, "tab") ?? "brokers";
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const status = sp(params, "status");
  const expiring = sp(params, "expiring");
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const brokerages = await brokerageOptions();
  const canCreate = can(user, "brokers:create");
  const actions = canCreate && (
    <>
      <FormDialog title="New brokerage" triggerVariant="outline" schema="brokerage" fields={brokerageFields()} action={saveBrokerage} wide defaultValues={{ accreditationStatus: "PENDING" }} />
      <FormDialog title="New broker" schema="broker" fields={brokerFields(brokerages)} action={saveBroker} wide defaultValues={{ accreditationStatus: "PENDING", role: "SALESPERSON" }} />
    </>
  );
  const tabs = <LinkTabs tabs={[{ key: "brokers", label: "Brokers & salespersons" }, { key: "brokerages", label: "Brokerages" }]} active={tab} baseHref="/brokers" />;

  if (tab === "brokerages") {
    const where: any = { deletedAt: null, ...(status ? { accreditationStatus: status } : {}), ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.brokerage.findMany({ where, include: { _count: { select: { brokers: { where: { deletedAt: null } }, transactions: { where: { status: { notIn: ["CANCELLED", "TRANSFERRED"] } } } } } }, orderBy: { name: "asc" }, skip, take }),
      prisma.brokerage.count({ where }),
    ]);
    return (
      <>
        <PageHeader title="Brokers" actions={actions} />
        {tabs}
        <Card>
          <FilterBar basePath="/brokers" values={params} extra={<input type="hidden" name="tab" value="brokerages" />} filters={[{ type: "search", name: "q", placeholder: "Brokerage name" }, { type: "select", name: "status", label: "Accreditation", options: options(E.AccreditationStatus) }]} />
          <Table>
            <THead>
              <TR>
                <TH>Brokerage</TH>
                <TH>Contact</TH>
                <TH>Accreditation</TH>
                <TH>Expiry</TH>
                <TH className="text-right">Brokers</TH>
                <TH className="text-right">Active sales</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/brokers/brokerages/${b.id}`} className="font-medium text-brand-800 hover:underline">
                      {b.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{b.city}</div>
                  </TD>
                  <TD className="text-xs">
                    {b.contactPerson}
                    <div className="text-muted-foreground">{[b.phone, b.email].filter(Boolean).join(" · ")}</div>
                  </TD>
                  <TD>
                    <StatusBadge status={b.accreditationStatus} />
                  </TD>
                  <TD>
                    <ExpiryBadge date={b.accreditationExpiry} />
                  </TD>
                  <TD className="text-right tabular">{b._count.brokers}</TD>
                  <TD className="text-right tabular">{b._count.transactions}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {rows.length === 0 && <EmptyState title="No brokerages" />}
          <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/brokers" />
        </Card>
      </>
    );
  }

  const where: any = {
    deletedAt: null,
    ...(status ? { accreditationStatus: status } : {}),
    ...(sp(params, "brokerageId") ? { brokerageId: sp(params, "brokerageId") } : {}),
    ...(expiring === "license" ? { prcLicenseExpiry: { lte: soon } } : {}),
    ...(expiring === "accreditation" ? { accreditationExpiry: { lte: soon } } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q.replace(/\D/g, "").slice(-10) } },
            { prcLicenseNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.broker.findMany({
      where,
      include: { brokerage: { select: { id: true, name: true } }, _count: { select: { leads: { where: { deletedAt: null } }, transactions: { where: { status: { notIn: ["CANCELLED", "TRANSFERRED"] } } } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take,
    }),
    prisma.broker.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Brokers" description="External brokers and salespersons. Brokers don't log in — staff record everything on their behalf." actions={actions} />
      {tabs}
      <Card>
        <FilterBar
          basePath="/brokers"
          values={params}
          filters={[
            { type: "search", name: "q", placeholder: "Name, email, mobile, PRC no." },
            { type: "select", name: "brokerageId", label: "Brokerage", options: brokerages },
            { type: "select", name: "status", label: "Accreditation", options: options(E.AccreditationStatus) },
            { type: "select", name: "expiring", label: "Expiring ≤ 60 days", options: [{ value: "license", label: "PRC license" }, { value: "accreditation", label: "Accreditation" }] },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Broker</TH>
              <TH>Brokerage</TH>
              <TH>Role</TH>
              <TH>Accreditation</TH>
              <TH>PRC license</TH>
              <TH>Accreditation expiry</TH>
              <TH className="text-right">Leads</TH>
              <TH className="text-right">Active sales</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/brokers/${b.id}`} className="font-medium text-brand-800 hover:underline">
                    {fullName(b)}
                  </Link>
                  <div className="text-xs text-muted-foreground">{[formatPhMobile(b.mobile), b.email].filter((x) => x && x !== "—").join(" · ")}</div>
                </TD>
                <TD className="text-xs">{b.brokerage ? <Link href={`/brokers/brokerages/${b.brokerage.id}`} className="hover:underline">{b.brokerage.name}</Link> : "Independent"}</TD>
                <TD className="text-xs">{label(b.role)}</TD>
                <TD>
                  <StatusBadge status={b.accreditationStatus} />
                </TD>
                <TD className="text-xs">
                  <div>{b.prcLicenseNo ?? "—"}</div>
                  <ExpiryBadge date={b.prcLicenseExpiry} />
                </TD>
                <TD>
                  <ExpiryBadge date={b.accreditationExpiry} />
                </TD>
                <TD className="text-right tabular">{b._count.leads}</TD>
                <TD className="text-right tabular">{b._count.transactions}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <EmptyState title="No brokers found" />}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/brokers" />
      </Card>
    </>
  );
}
