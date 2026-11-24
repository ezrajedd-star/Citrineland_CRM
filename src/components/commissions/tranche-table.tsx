"use client";

import * as React from "react";
import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/app/page";
import { TrancheActions } from "./tranche-actions";
import { formatPeso } from "@/lib/money";

export interface TrancheRow {
  id: string;
  status: string;
  label: string;
  txId: string;
  txCode: string;
  client: string;
  broker: string;
  brokerage: string;
  amountCents: number;
  brokerageAmountCents: number;
  agentAmountCents: number;
  date: string;
}

export function TrancheTable({ rows, canApprove, canRelease }: { rows: TrancheRow[]; canApprove: boolean; canRelease: boolean }) {
  const [sel, setSel] = React.useState<string[]>([]);
  const selectable = rows.filter((r) => (r.status === "DUE" && canApprove) || (r.status === "APPROVED" && canRelease));
  const status = rows.find((r) => sel.includes(r.id))?.status ?? "";
  const total = rows.filter((r) => sel.includes(r.id)).reduce((a, r) => a + r.amountCents, 0);
  return (
    <>
      {selectable.length > 0 && (
        <div className="flex items-center justify-between border-b bg-stone-50 px-3 py-2 text-sm">
          <span>
            {sel.length} selected {sel.length > 0 && `· ${formatPeso(total)}`}
          </span>
          <TrancheActions ids={sel} status={status} canApprove={canApprove} canRelease={canRelease} bulk />
        </div>
      )}
      <Table>
        <THead>
          <TR>
            <TH className="w-8">
              {selectable.length > 0 && <input type="checkbox" aria-label="Select all" className="accent-brand-600" checked={sel.length === selectable.length && sel.length > 0} onChange={(e) => setSel(e.target.checked ? selectable.map((r) => r.id) : [])} />}
            </TH>
            <TH>Transaction</TH>
            <TH>Broker / brokerage</TH>
            <TH>Tranche</TH>
            <TH>Status</TH>
            <TH className="text-right">Brokerage</TH>
            <TH className="text-right">Agent</TH>
            <TH className="text-right">Amount</TH>
            <TH>Date</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => {
            const can = selectable.some((s) => s.id === r.id) && (!status || r.status === status);
            return (
              <TR key={r.id}>
                <TD>{can && <input type="checkbox" className="accent-brand-600" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />}</TD>
                <TD>
                  <Link href={`/transactions/${r.txId}?tab=commission`} className="font-medium text-brand-800 hover:underline">
                    {r.txCode}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.client}</div>
                </TD>
                <TD className="text-xs">
                  {r.broker}
                  <div className="text-muted-foreground">{r.brokerage}</div>
                </TD>
                <TD className="text-xs">{r.label}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-right tabular">{formatPeso(r.brokerageAmountCents)}</TD>
                <TD className="text-right tabular">{formatPeso(r.agentAmountCents)}</TD>
                <TD className="text-right tabular font-medium">{formatPeso(r.amountCents)}</TD>
                <TD className="text-xs">{r.date}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </>
  );
}
