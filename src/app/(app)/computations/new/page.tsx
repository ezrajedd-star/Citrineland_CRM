import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { PageHeader } from "@/components/app/page";
import { QuoteBuilder } from "@/components/transactions/quote-builder";
import { loadBuilderData } from "@/server/queries/builder";
import { dayInput, manilaToday } from "@/lib/format";

export const metadata = { title: "New sample computation" };

export default async function NewComputationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("computations:create");
  const sp = await searchParams;
  const data = await loadBuilderData(user, sp);
  return (
    <>
      <PageHeader title="Sample computation" description="Prices are taken from the current price list. VAT, fees and loan rates come from Settings." breadcrumbs={sp.leadId ? [{ href: `/pipeline/leads/${sp.leadId}?tab=computations`, label: "Lead" }] : undefined} />
      <QuoteBuilder mode="computation" {...data} today={dayInput(manilaToday())} canDiscount={can(user, "transactions:update")} />
    </>
  );
}
