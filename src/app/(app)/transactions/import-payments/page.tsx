import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { PAYMENT_IMPORT_COLUMNS } from "@/server/import-payments";
import { PaymentImport } from "./wizard";

export const metadata = { title: "Import payments" };

export default async function ImportPaymentsPage() {
  await requirePermission("payments:import");
  return (
    <>
      <PageHeader title="Import payments (CSV)" breadcrumbs={[{ href: "/transactions", label: "Transactions" }]} description="For bulk encoding of collections (e.g. bank statement exports). Imported payments are tagged source = CSV." />
      <Card className="mb-4">
        <CardContent className="pt-4 text-xs text-muted-foreground">
          <code className="block overflow-x-auto rounded bg-stone-100 p-2">{PAYMENT_IMPORT_COLUMNS.join(",")}</code>
          <p className="mt-2">
            <b>paid_at</b> as YYYY-MM-DD · <b>amount</b> in pesos · <b>method</b>: CASH, CHECK, PDC, BANK_TRANSFER, ONLINE, CREDIT_CARD, LOAN_PROCEEDS, OTHER · <b>external_id</b> (optional) prevents double import.
          </p>
        </CardContent>
      </Card>
      <PaymentImport />
    </>
  );
}
