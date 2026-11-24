import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader, Pagination, EmptyState } from "@/components/app/page";
import { FilterBar, sp, pageParams } from "@/components/app/filter-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { saveClient } from "@/server/actions/crm";
import { clientFields } from "@/components/forms/crm-fields";
import { userOptions, brokerOptions } from "@/server/queries/options";
import { formatPhMobile, normalizeName } from "@/lib/normalize";
import { formatDay } from "@/lib/format";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("clients:view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  let idFilter: string[] | undefined;
  if (q && q.length >= 3) {
    const sim = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Client" WHERE "deletedAt" IS NULL AND (similarity("normalizedName", ${normalizeName(q)}) > 0.3 OR "normalizedName" LIKE ${"%" + normalizeName(q) + "%"}) LIMIT 200`;
    idFilter = sim.map((s) => s.id);
  }
  const where: any = {
    deletedAt: null,
    ...(sp(params, "brokerId") ? { brokerId: sp(params, "brokerId") } : {}),
    ...(sp(params, "ownerId") ? { ownerId: sp(params, "ownerId") } : {}),
    ...(q
      ? {
          OR: [
            ...(idFilter ? [{ id: { in: idFilter } }] : []),
            { email: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q.replace(/\D/g, "").slice(-10) || "∅" } },
            { tin: { contains: q } },
          ],
        }
      : {}),
  };
  const [rows, total, users, brokers] = await Promise.all([
    prisma.client.findMany({ where, include: { broker: true, owner: { select: { name: true } }, _count: { select: { transactions: { where: { status: { notIn: ["CANCELLED", "TRANSFERRED"] } } } } } }, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.client.count({ where }),
    userOptions(),
    brokerOptions(),
  ]);
  return (
    <>
      <PageHeader title="Clients" description="Buyers. Created automatically at reservation, or manually." actions={can(user, "clients:create") && <FormDialog title="New client" schema="client" wide fields={clientFields({ users, brokers })} action={saveClient} defaultValues={{ ownerId: user.id, nationality: "Filipino" }} />} />
      <Card>
        <FilterBar
          basePath="/clients"
          values={params}
          filters={[
            { type: "search", name: "q", placeholder: "Name (fuzzy), email, mobile, TIN" },
            { type: "select", name: "brokerId", label: "Broker", options: brokers },
            { type: "select", name: "ownerId", label: "Owner", options: users },
          ]}
        />
        <Table>
          <THead>
            <TR>
              <TH>Client</TH>
              <TH>Contact</TH>
              <TH>Broker of record</TH>
              <TH>Owner</TH>
              <TH className="text-right">Active transactions</TH>
              <TH>Since</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/clients/${c.id}`} className="font-medium text-brand-800 hover:underline">
                    {c.anonymizedAt ? "Anonymized client" : fullName(c)}
                  </Link>
                </TD>
                <TD className="text-xs">{[formatPhMobile(c.mobile), c.email].filter((x) => x && x !== "—").join(" · ")}</TD>
                <TD className="text-xs">{c.broker ? fullName(c.broker) : "Direct"}</TD>
                <TD className="text-xs">{c.owner?.name ?? "—"}</TD>
                <TD className="text-right tabular">{c._count.transactions}</TD>
                <TD className="text-xs">{formatDay(c.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <EmptyState title="No clients found" />}
        <Pagination page={page} pageSize={pageSize} total={total} searchParams={params} basePath="/clients" />
      </Card>
    </>
  );
}
