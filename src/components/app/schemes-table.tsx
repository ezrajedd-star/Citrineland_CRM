import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/page";
import { savePaymentScheme } from "@/server/actions/inventory";
import { paymentSchemeFields } from "@/components/forms/inventory-fields";
import { label } from "@/lib/labels";
import { formatPeso } from "@/lib/money";

export function SchemesTable({ schemes, canEdit, devOpts }: { schemes: any[]; canEdit: boolean; devOpts: { value: string; label: string }[] }) {
  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Scheme</TH>
            <TH>Type</TH>
            <TH className="text-right">Reservation</TH>
            <TH>Terms</TH>
            <TH>Scope</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {schemes.map((s) => (
            <TR key={s.id} className={s.active ? "" : "opacity-50"}>
              <TD className="font-medium">{s.name}</TD>
              <TD>{label(s.kind)}</TD>
              <TD className="text-right tabular">{formatPeso(s.reservationFeeCents)}</TD>
              <TD className="text-xs">
                {s.kind === "SPOT_CASH" && `${s.spotDiscountPct}% discount`}
                {s.kind === "DEFERRED_CASH" && `${s.deferredMonths} equal monthly payments`}
                {s.kind === "DP_BALANCE" &&
                  `${s.dpPct}% DP ${s.dpMonths ? `over ${s.dpMonths} mo` : "spot"}${s.spotDpDiscountPct ? ` (${s.spotDpDiscountPct}% spot DP discount)` : ""}; balance via ${label(s.financing)}${s.interestRatePct ? ` @ ${s.interestRatePct}%` : ""}${s.termMonths ? `, ${s.termMonths} mo` : ""}`}
              </TD>
              <TD className="text-xs">{s.developmentId ? "This development" : "All developments"}</TD>
              <TD className="text-right">
                {canEdit && (
                  <FormDialog
                    title="Edit payment scheme"
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                    schema="paymentScheme"
                    fields={paymentSchemeFields(devOpts)}
                    action={savePaymentScheme}
                    wide
                    defaultValues={{ ...s, reservationFee: Number(s.reservationFeeCents) / 100 }}
                  />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {schemes.length === 0 && <EmptyState title="No payment schemes" />}
    </>
  );
}

