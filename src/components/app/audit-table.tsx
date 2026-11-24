import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export type AuditRow = { id: string; createdAt: Date; action: string; entity: string; entityId: string; diff: any; ip: string | null; actor: { name: string } | null };

function renderVal(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-stone-400">∅</span>;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return <span className="break-all">{s.length > 80 ? s.slice(0, 80) + "…" : s}</span>;
}

export function AuditTable({ rows, showEntity = true }: { rows: AuditRow[]; showEntity?: boolean }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>When</TH>
          <TH>Who</TH>
          <TH>Action</TH>
          {showEntity && <TH>Record</TH>}
          <TH>Changes</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id} className="align-top">
            <TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</TD>
            <TD className="text-xs">
              {r.actor?.name ?? "System"}
              {r.ip && <div className="text-stone-400">{r.ip}</div>}
            </TD>
            <TD className="text-xs font-medium">{r.action.replace(/_/g, " ")}</TD>
            {showEntity && (
              <TD className="text-xs">
                {r.entity}
                <div className="text-stone-400">{r.entityId}</div>
              </TD>
            )}
            <TD className="text-xs">
              {r.diff && Object.keys(r.diff).length > 0 ? (
                <ul className="space-y-0.5">
                  {Object.entries(r.diff as Record<string, [unknown, unknown]>)
                    .slice(0, 12)
                    .map(([k, [a, b]]) => (
                      <li key={k}>
                        <span className="font-medium text-stone-600">{k}</span>: {renderVal(a)} → {renderVal(b)}
                      </li>
                    ))}
                </ul>
              ) : (
                <span className="text-stone-400">—</span>
              )}
            </TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
              No history yet.
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}
