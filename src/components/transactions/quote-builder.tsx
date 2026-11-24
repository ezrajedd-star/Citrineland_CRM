"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Checkbox, Textarea } from "@/components/ui/input";
import { ComputationView } from "./computation-view";
import { previewQuote, createComputation, reserve } from "@/server/actions/transactions";
import type { ComputationResult } from "@/domain/pricing/computation";
import { formatPeso } from "@/lib/money";

export interface BuilderItem {
  id: string;
  code: string;
  developmentId: string;
  sectionId: string | null;
  status: string;
  priceCents: number;
  label: string;
  holdId: string | null;
  holdMine: boolean;
}
export interface BuilderScheme {
  id: string;
  name: string;
  developmentId: string | null;
}
type Opt = { value: string; label: string };

export function QuoteBuilder({
  mode,
  developments,
  units,
  slots,
  schemes,
  leads,
  clients,
  brokers,
  users,
  initial,
  today,
  canDiscount,
}: {
  mode: "computation" | "reservation";
  developments: Opt[];
  units: BuilderItem[];
  slots: BuilderItem[];
  schemes: BuilderScheme[];
  leads: Opt[];
  clients: Opt[];
  brokers: Opt[];
  users: Opt[];
  initial: { developmentId?: string; unitId?: string; parkingSlotIds?: string[]; holdId?: string; leadId?: string; clientId?: string; brokerId?: string; handlingStaffId?: string; paymentSchemeId?: string };
  today: string;
  canDiscount: boolean;
}) {
  const router = useRouter();
  const [devId, setDevId] = React.useState(initial.developmentId ?? developments[0]?.value ?? "");
  const [unitId, setUnitId] = React.useState(initial.unitId ?? "");
  const [slotIds, setSlotIds] = React.useState<string[]>(initial.parkingSlotIds ?? []);
  const [schemeId, setSchemeId] = React.useState(initial.paymentSchemeId ?? "");
  const [discountPct, setDiscountPct] = React.useState("");
  const [discountAmount, setDiscountAmount] = React.useState("");
  const [buyerKind, setBuyerKind] = React.useState<"lead" | "client">(initial.clientId ? "client" : "lead");
  const [leadId, setLeadId] = React.useState(initial.leadId ?? "");
  const [clientId, setClientId] = React.useState(initial.clientId ?? "");
  const [brokerId, setBrokerId] = React.useState(initial.brokerId ?? "");
  const [staffId, setStaffId] = React.useState(initial.handlingStaffId ?? "");
  const [resDate, setResDate] = React.useState(today);
  const [firstDue, setFirstDue] = React.useState("");
  const [rfPaid, setRfPaid] = React.useState(true);
  const [orNumber, setOrNumber] = React.useState("");
  const [method, setMethod] = React.useState("CASH");
  const [notes, setNotes] = React.useState("");
  const [result, setResult] = React.useState<ComputationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const devUnits = units.filter((u) => u.developmentId === devId);
  const devSlots = slots.filter((s) => s.developmentId === devId);
  const devSchemes = schemes.filter((s) => !s.developmentId || s.developmentId === devId);
  const unit = units.find((u) => u.id === unitId);
  const holdId = unit?.holdId ?? slots.find((s) => slotIds.includes(s.id) && s.holdId)?.holdId ?? initial.holdId ?? "";

  React.useEffect(() => {
    if (!schemeId || (!unitId && slotIds.length === 0)) {
      setResult(null);
      return;
    }
    const t = setTimeout(async () => {
      const r = await previewQuote({ developmentId: devId, unitId: unitId || null, parkingSlotIds: slotIds, paymentSchemeId: schemeId, discountPct: discountPct || null, discountAmount: discountAmount || null } as any);
      if (r.ok) {
        setResult(r.data as ComputationResult);
        setError(null);
      } else {
        setResult(null);
        setError(r.error);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [devId, unitId, slotIds, schemeId, discountPct, discountAmount]);

  const submit = () =>
    start(async () => {
      const common = { developmentId: devId, unitId: unitId || null, parkingSlotIds: slotIds, paymentSchemeId: schemeId, discountPct: discountPct || null, discountAmount: discountAmount || null };
      const buyer = buyerKind === "lead" ? { leadId: leadId || null, clientId: null } : { clientId: clientId || null, leadId: null };
      const r =
        mode === "computation"
          ? await createComputation({ ...common, ...buyer } as any)
          : await reserve({
              ...common,
              ...buyer,
              holdId: holdId || null,
              brokerId: brokerId || null,
              handlingStaffId: staffId || null,
              reservationDate: resDate,
              firstDueDate: firstDue || null,
              reservationFeePaid: rfPaid,
              orNumber: orNumber || null,
              paymentMethod: rfPaid ? method : null,
              notes: notes || null,
            } as any);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        if (r.redirect) router.push(r.redirect);
      } else {
        toast.error(r.error);
        setError(r.error);
      }
    });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Unit & parking</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Development">
              <NativeSelect value={devId} onChange={(e) => { setDevId(e.target.value); setUnitId(""); setSlotIds([]); setSchemeId(""); }}>
                {developments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Unit">
              <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">— parking only —</option>
                {devUnits.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.status === "ON_HOLD" && !u.holdMine && u.id !== initial.unitId}>
                    {u.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {devSlots.length > 0 && (
              <div className="sm:col-span-2">
                <Label>Parking slots (optional, bundled)</Label>
                <div className="mt-1.5 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-white p-2">
                  {devSlots.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="checkbox" className="accent-brand-600" checked={slotIds.includes(s.id)} onChange={(e) => setSlotIds(e.target.checked ? [...slotIds, s.id] : slotIds.filter((x) => x !== s.id))} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {holdId && <p className="text-xs text-amber-700 sm:col-span-2">Reserving from an active hold — the hold will be converted.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Payment scheme</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Scheme" className="sm:col-span-3">
              <NativeSelect value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                <option value="">Select…</option>
                {devSchemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            {(canDiscount || mode === "computation") && (
              <>
                <Field label="Promo discount %">
                  <Input inputMode="decimal" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Promo discount (₱)">
                  <Input inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0.00" />
                </Field>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>3. Buyer{mode === "reservation" ? " & broker of record" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Buyer is a">
              <NativeSelect value={buyerKind} onChange={(e) => setBuyerKind(e.target.value as any)}>
                <option value="lead">Lead (client is created on reservation)</option>
                <option value="client">Existing client</option>
              </NativeSelect>
            </Field>
            {buyerKind === "lead" ? (
              <Field label="Lead">
                <NativeSelect value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">Select…</option>
                  {leads.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Client">
                <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Select…</option>
                  {clients.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </NativeSelect>
              </Field>
            )}
            {mode === "reservation" && (
              <>
                <Field label="Broker of record">
                  <NativeSelect value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
                    <option value="">From lead / client (or direct)</option>
                    {brokers.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Handling staff">
                  <NativeSelect value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    <option value="">Me</option>
                    {users.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </NativeSelect>
                </Field>
              </>
            )}
          </CardContent>
        </Card>
        {mode === "reservation" && (
          <Card>
            <CardHeader>
              <CardTitle>4. Reservation</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Reservation date">
                <Input type="date" value={resDate} onChange={(e) => setResDate(e.target.value)} />
              </Field>
              <Field label="First installment due (default: +1 month)">
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={rfPaid} onChange={(e) => setRfPaid(e.target.checked)} /> Reservation fee {result ? formatPeso(result.reservationFeeCents) : ""} received now
              </label>
              {rfPaid && (
                <>
                  <Field label="OR number">
                    <Input value={orNumber} onChange={(e) => setOrNumber(e.target.value)} />
                  </Field>
                  <Field label="Method">
                    <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}>
                      {["CASH", "CHECK", "BANK_TRANSFER", "ONLINE", "CREDIT_CARD"].map((m) => <option key={m} value={m}>{m.replace("_", " ").toLowerCase()}</option>)}
                    </NativeSelect>
                  </Field>
                </>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </Field>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="lg:col-span-2">
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>{mode === "computation" ? "Sample computation" : "Price & payment terms"}</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div>}
            {result ? <ComputationView c={result} /> : <p className="text-sm text-muted-foreground">Select a unit (or parking) and a payment scheme to see the computation.</p>}
            <Button className="mt-4 w-full" size="lg" disabled={pending || !result || (buyerKind === "lead" ? !leadId : !clientId)} onClick={submit}>
              {pending ? "Working…" : mode === "computation" ? "Save computation" : "Reserve now"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
