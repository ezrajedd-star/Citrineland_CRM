"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AppSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Checkbox } from "@/components/ui/input";
import { updateSettings } from "@/server/actions/admin-config";

type Path = string;
function get(o: any, p: Path) {
  return p.split(".").reduce((a, k) => a?.[k], o);
}
function set(o: any, p: Path, v: unknown) {
  const keys = p.split(".");
  const copy = structuredClone(o);
  let cur = copy;
  for (const k of keys.slice(0, -1)) cur = cur[k];
  cur[keys.at(-1)!] = v;
  return copy;
}

export function SettingsForm({ initial, readOnly }: { initial: AppSettings; readOnly: boolean }) {
  const router = useRouter();
  const [s, setS] = React.useState<AppSettings>(initial);
  const [pending, start] = React.useTransition();
  const num = (p: Path, opts: { money?: boolean; suffix?: string; label: string; help?: string }) => {
    const raw = get(s, p) as number;
    const shown = opts.money ? raw / 100 : raw;
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{opts.label}</Label>
        <div className="relative">
          {opts.money && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">₱</span>}
          <Input
            disabled={readOnly}
            inputMode="decimal"
            className={`tabular ${opts.money ? "pl-7" : ""}`}
            value={Number.isFinite(shown) ? String(shown) : ""}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/,/g, ""));
              setS(set(s, p, Number.isFinite(v) ? (opts.money ? Math.round(v * 100) : v) : 0));
            }}
          />
          {opts.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">{opts.suffix}</span>}
        </div>
        {opts.help && <p className="text-xs text-muted-foreground">{opts.help}</p>}
      </div>
    );
  };
  const bool = (p: Path, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox disabled={readOnly} checked={Boolean(get(s, p))} onChange={(e) => setS(set(s, p, e.target.checked))} /> {label}
    </label>
  );
  const text = (p: Path, label: string, area = false) => (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label>{label}</Label>
      {area ? <Textarea disabled={readOnly} rows={4} value={get(s, p)} onChange={(e) => setS(set(s, p, e.target.value))} /> : <Input disabled={readOnly} value={get(s, p)} onChange={(e) => setS(set(s, p, e.target.value))} />}
    </div>
  );
  const list = (p: Path, label: string, help?: string) => (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label>{label}</Label>
      <Input disabled={readOnly} value={(get(s, p) as string[]).join(", ")} onChange={(e) => setS(set(s, p, e.target.value.split(",").map((x) => x.trim()).filter(Boolean)))} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
  const Section = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</CardContent>
    </Card>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateSettings(s as any);
          if (r.ok) {
            toast.success("Settings saved");
            router.refresh();
          } else toast.error(r.error + (r.fieldErrors ? ` (${Object.keys(r.fieldErrors).join(", ")})` : ""));
        });
      }}
    >
      {Section({
        title: "Inventory & holds",
        children: (
          <>
            {num("holdDurationHours", { label: "Default hold duration", suffix: "hours" })}
            {num("holdNearExpiryHours", { label: "Warn holder before expiry", suffix: "hours" })}
            <div className="sm:col-span-2">{bool("parkingRequiresUnitOwnership", "Parking can only be reserved by clients with a unit in the same building")}</div>
          </>
        ),
      })}
      {Section({
        title: "VAT",
        desc: "Confirm current BIR thresholds with Citrineland's tax adviser. Sales at or below a threshold are VAT-exempt.",
        children: (
          <>
            <div className="sm:col-span-2 space-y-2">
              {bool("vat.enabled", "Charge VAT")}
              {bool("vat.pricesIncludeVat", "List prices already include VAT")}
              {bool("vat.parkingAlwaysVatable", "Parking slots are always VATable")}
            </div>
            {num("vat.ratePct", { label: "VAT rate", suffix: "%" })}
            <div />
            {num("vat.exemptThresholdCents.CONDO", { label: "Exempt threshold — condo", money: true })}
            {num("vat.exemptThresholdCents.HOUSE_AND_LOT", { label: "Exempt threshold — house & lot", money: true })}
            {num("vat.exemptThresholdCents.LOT_ONLY", { label: "Exempt threshold — lot only", money: true })}
          </>
        ),
      })}
      {Section({
        title: "Fees, computations & reservations",
        children: (
          <>
            {num("miscFees.pct", { label: "Misc. fees / other charges", suffix: "% of NSP" })}
            <div className="flex items-end">{bool("miscFees.includeInTcp", "Include misc. fees in TCP")}</div>
            {num("computationValidityDays", { label: "Sample computation validity", suffix: "days" })}
            {num("spotCashDueDays", { label: "Spot cash balance due", suffix: "days after reservation" })}
            {num("defaultReservationFeeCents", { label: "Default reservation fee", money: true })}
            {num("defaultCommissionPct", { label: "Fallback commission rate", suffix: "%" })}
            {num("stalledLeadDays", { label: "Lead without activity → follow-up", suffix: "days" })}
            {text("computationDisclaimer", "Computation disclaimer", true)}
          </>
        ),
      })}
      {Section({
        title: "Default financing rates (indicative amortization)",
        children: (
          <>
            {num("financingDefaults.BANK.ratePct", { label: "Bank rate", suffix: "% p.a." })}
            {num("financingDefaults.BANK.termMonths", { label: "Bank term", suffix: "months" })}
            {num("financingDefaults.PAGIBIG.ratePct", { label: "Pag-IBIG rate", suffix: "% p.a." })}
            {num("financingDefaults.PAGIBIG.termMonths", { label: "Pag-IBIG term", suffix: "months" })}
            {num("financingDefaults.IN_HOUSE.ratePct", { label: "In-house rate", suffix: "% p.a." })}
            {num("financingDefaults.IN_HOUSE.termMonths", { label: "In-house term", suffix: "months" })}
          </>
        ),
      })}
      {Section({
        title: "Email capture (Microsoft 365)",
        children: (
          <>
            <div className="space-y-2 sm:col-span-2">
              {bool("email.captureEnabled", "Capture emails with known contacts onto timelines")}
              {bool("email.storeFullBodies", "Store full email bodies (default: subject + snippet only)")}
            </div>
            {list("email.internalDomains", "Internal email domains", "Emails only between these domains are ignored")}
          </>
        ),
      })}
      {Section({
        title: "Web lead form",
        children: (
          <>
            <div className="sm:col-span-2">{bool("webForm.enabled", "Accept leads from the public web form")}</div>
            {num("webForm.rateLimitPerHour", { label: "Max submissions per IP", suffix: "per hour" })}
            <div />
            {list("webForm.allowedOrigins", "Allowed website origins (CORS)", "e.g. https://www.citrineland.com")}
            {text("webForm.defaultSourceCode", "Default lead source code")}
            {text("webForm.successMessage", "Success message")}
          </>
        ),
      })}
      {Section({
        title: "Security",
        children: <div className="sm:col-span-4">{bool("passwordLoginEnabled", "Allow the bootstrap Admin to sign in with a password (turn off once Microsoft SSO works)")}</div>,
      })}
      {!readOnly && (
        <div className="sticky bottom-4 flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </form>
  );
}
