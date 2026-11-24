import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { FormDialog } from "@/components/app/form-dialog";
import { SchemesTable } from "@/components/app/schemes-table";
import { savePaymentScheme } from "@/server/actions/inventory";
import { paymentSchemeFields } from "@/components/forms/inventory-fields";

export const metadata = { title: "Payment schemes" };

export default async function PaymentSchemesPage() {
  await requirePermission("payment_schemes:manage");
  const [schemes, devs] = await Promise.all([
    prisma.paymentScheme.findMany({ where: { deletedAt: null }, include: { development: { select: { name: true } } }, orderBy: [{ developmentId: "asc" }, { sortOrder: "asc" }] }),
    prisma.development.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const devOpts = devs.map((d) => ({ value: d.id, label: d.name }));
  return (
    <>
      <PageHeader
        title="Payment schemes"
        description="Configurable per development. Spot cash, deferred cash, and DP + balance via bank, Pag-IBIG or in-house financing."
        breadcrumbs={[{ href: "/admin", label: "Admin" }]}
        actions={<FormDialog title="Add payment scheme" schema="paymentScheme" fields={paymentSchemeFields(devOpts)} action={savePaymentScheme} wide defaultValues={{ active: true, spotDiscountPct: 0, spotDpDiscountPct: 0, sortOrder: 0, reservationFee: 25000 }} />}
      />
      <Card>
        <SchemesTable schemes={schemes} canEdit devOpts={devOpts} />
      </Card>
    </>
  );
}
