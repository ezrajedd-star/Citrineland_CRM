import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader } from "@/components/app/page";
import { QuoteBuilder } from "@/components/transactions/quote-builder";
import { loadBuilderData } from "@/server/queries/builder";
import { dayInput, manilaToday } from "@/lib/format";

export const metadata = { title: "New reservation" };

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("transactions:create");
  const sp = await searchParams;
  const data = await loadBuilderData(user, sp);
  return (
    <>
      <PageHeader
        title="Create transaction (reservation)"
        description="Select the unit (and parking), payment scheme and buyer. The unit is locked while reserving so it can't be double-sold. The payment schedule and documentation checklist are generated automatically."
        breadcrumbs={[{ href: "/transactions", label: "Transactions" }]}
      />
      <QuoteBuilder mode="reservation" {...data} today={dayInput(manilaToday())} canDiscount={can(user, "transactions:update")} />
    </>
  );
}
