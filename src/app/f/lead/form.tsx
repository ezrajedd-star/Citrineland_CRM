"use client";

import * as React from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { brand } from "@/config/brand";

export function PublicLeadForm({ developments, defaultDevelopment, utm, siteKey, nonce }: { developments: { code: string; name: string }[]; defaultDevelopment?: string; utm: Record<string, string | undefined>; siteKey: string | null; nonce?: string }) {
  const [state, setState] = React.useState<{ status: "idle" | "sending" | "done" | "error"; message?: string; fieldErrors?: Record<string, string[]> }>({ status: "idle" });
  if (state.status === "done") return <div className="mx-auto max-w-md rounded-lg border p-6 text-center text-sm">{state.message}</div>;
  return (
    <form
      className="mx-auto max-w-md space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ status: "sending" });
        const fd = new FormData(e.currentTarget);
        const body = Object.fromEntries(fd.entries());
        const res = await fetch("/api/public/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, privacyConsent: fd.get("privacyConsent") === "on" }) });
        const j = await res.json().catch(() => ({}));
        if (res.ok) setState({ status: "done", message: j.message });
        else setState({ status: "error", message: j.error ?? "Something went wrong", fieldErrors: j.fieldErrors });
      }}
    >
      <h1 className="text-lg font-semibold">Inquire with {brand.name}</h1>
      {Object.entries(utm).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      {/* Honeypot: hidden from humans */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fn">First name</Label>
          <Input id="fn" name="firstName" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ln">Last name</Label>
          <Input id="ln" name="lastName" required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="m">Mobile</Label>
        <Input id="m" name="mobile" placeholder="+63 9XX XXX XXXX" />
        {state.fieldErrors?.mobile && <p className="text-xs text-red-600">{state.fieldErrors.mobile[0]}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="e">Email</Label>
        <Input id="e" name="email" type="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="d">Property of interest</Label>
        <NativeSelect id="d" name="developmentCode" defaultValue={defaultDevelopment ?? ""}>
          <option value="">Any</option>
          {developments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="msg">Message</Label>
        <Textarea id="msg" name="message" rows={3} />
      </div>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" name="privacyConsent" required className="mt-0.5 accent-brand-600" />
        I consent to {brand.name} collecting and processing my personal data to respond to my inquiry, in accordance with the Data Privacy Act of 2012 (RA 10173).
      </label>
      {siteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
          <div className="cf-turnstile" data-sitekey={siteKey} />
        </>
      )}
      {state.status === "error" && <p className="text-sm text-red-700">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : "Send inquiry"}
      </Button>
    </form>
  );
}
