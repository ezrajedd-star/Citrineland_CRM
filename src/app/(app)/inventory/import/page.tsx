import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/app/page";
import { Card, CardContent } from "@/components/ui/card";
import { IMPORT_COLUMNS } from "@/server/import-inventory";
import { ImportWizard } from "./wizard";
import { dayInput, manilaToday } from "@/lib/format";

export const metadata = { title: "Import inventory" };

export default async function ImportPage() {
  await requirePermission("units:import");
  const devs = await prisma.development.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Import units & prices" breadcrumbs={[{ href: "/inventory", label: "Inventory" }]} description="Upload a CSV or XLSX. Rows are matched by code: new codes are created, existing ones updated. Price changes create a new price list version." />
      <Card className="mb-4">
        <CardContent className="pt-4 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-stone-700">Columns (first row = headers)</p>
          <code className="block overflow-x-auto whitespace-nowrap rounded bg-stone-100 p-2">{IMPORT_COLUMNS.join(",")}</code>
          <p className="mt-2">
            <b>kind</b>: UNIT or PARKING · <b>unit_type</b>: CONDO, HOUSE_AND_LOT, LOT_ONLY · <b>parking_type</b>: REGULAR, TANDEM, PWD, EV · <b>section_code</b> must exist on the development · <b>price</b> in pesos.
          </p>
          <a className="mt-2 inline-block text-brand-700 hover:underline" href="/inventory/import/template">
            Download CSV template
          </a>
        </CardContent>
      </Card>
      <ImportWizard developments={devs.map((d) => ({ value: d.id, label: d.name }))} today={dayInput(manilaToday())} />
    </>
  );
}
