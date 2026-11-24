import type { ComputationResult } from "@/domain/pricing/computation";
import { formatPeso } from "@/lib/money";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";

function Row({ k, v, strong, neg, sub }: { k: React.ReactNode; v: number; strong?: boolean; neg?: boolean; sub?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 py-1", strong && "border-t pt-2 font-semibold", sub && "pl-4 text-stone-500")}>
      <span>{k}</span>
      <span className="tabular">{neg && v ? `(${formatPeso(v)})` : formatPeso(v)}</span>
    </div>
  );
}

/** Presentational breakdown of a sample computation (server or client). */
export function ComputationView({ c, compact }: { c: ComputationResult; compact?: boolean }) {
  return (
    <div className={cn("space-y-4 text-sm", compact && "text-xs")}>
      <div>
        {c.lines.map((l) => (
          <Row key={l.code} k={`${l.kind === "PARKING" ? "Parking " : "Unit "}${l.code} — list price`} v={l.listPriceCents} />
        ))}
        {c.lines.length > 1 && <Row k="Total list price" v={c.listPriceCents} strong />}
        {c.promoDiscountCents > 0 && <Row k="Less: promo discount" v={c.promoDiscountCents} neg />}
        {c.spotCashDiscountCents > 0 && <Row k="Less: spot cash discount" v={c.spotCashDiscountCents} neg />}
        <Row k="Net selling price" v={c.netSellingPriceCents} strong />
        <Row k={c.vatIncludedInPrice ? `VAT (${c.vatRatePct}%, included in price)` : `Add: VAT (${c.vatRatePct}%)${c.vatCents === 0 ? " — VAT-exempt" : ""}`} v={c.vatCents} />
        <Row k={`${c.miscFeesInTcp ? "Add: " : ""}Other charges / misc. fees (${c.miscFeesPct}%)${c.miscFeesInTcp ? "" : " — payable separately"}`} v={c.miscFeesCents} />
        <Row k="Total Contract Price (TCP)" v={c.tcpCents} strong />
      </div>
      <div className="rounded-md bg-stone-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.schemeName}</div>
        <Row k="Reservation fee" v={c.reservationFeeCents} />
        {c.schemeKind === "SPOT_CASH" && <Row k="Balance payable (spot)" v={c.spotBalanceCents} strong />}
        {c.schemeKind === "DEFERRED_CASH" && <Row k={`${c.deferredMonths} monthly payments of`} v={c.deferredMonthlyCents} strong />}
        {c.schemeKind === "DP_BALANCE" && (
          <>
            <Row k={`Down payment (${c.dpPct}% of TCP)`} v={c.dpGrossCents} />
            <Row k="Less: reservation fee" v={c.reservationFeeCents} neg sub />
            {c.spotDpDiscountCents > 0 && <Row k="Less: spot DP discount" v={c.spotDpDiscountCents} neg sub />}
            <Row k="Net down payment" v={c.dpNetPayableCents} />
            {c.dpMonths > 0 ? <Row k={`Monthly DP × ${c.dpMonths} months`} v={c.dpMonthlyCents} strong /> : <Row k="Spot down payment" v={c.dpNetPayableCents} strong />}
            <Row k={`Balance (${100 - c.dpPct}%) via ${label(c.financing)}`} v={c.balanceCents} strong />
          </>
        )}
      </div>
      {c.amortization.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Estimated monthly amortization on the balance</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-1 text-left font-medium">Financing</th>
                <th className="py-1 text-right font-medium">Rate</th>
                <th className="py-1 text-right font-medium">Term</th>
                <th className="py-1 text-right font-medium">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {c.amortization.map((a) => (
                <tr key={a.financing} className={cn(a.isSchemeFinancing && "font-semibold")}>
                  <td className="py-1">{label(a.financing)}</td>
                  <td className="py-1 text-right tabular">{a.ratePct}%</td>
                  <td className="py-1 text-right tabular">{a.termMonths / 12} yrs</td>
                  <td className="py-1 text-right tabular">{formatPeso(a.monthlyCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
