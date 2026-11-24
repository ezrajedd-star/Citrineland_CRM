import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Svg, Polygon } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { brand } from "@/config/brand";
import type { ComputationResult } from "@/domain/pricing/computation";
import { formatDateTime, formatDate } from "@/lib/format";
import { fullName } from "@/lib/utils";
import { label } from "@/lib/labels";

// react-pdf's built-in Helvetica has no ₱ glyph, so amounts use "PHP".
const peso = (c: number) => `PHP ${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: brand.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `2pt solid ${brand.colors[500]}`, paddingBottom: 10, marginBottom: 14 },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: brand.muted },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 10, color: brand.colors[800] },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  strong: { fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTop: `1pt solid ${brand.colors[300]}`, marginTop: 2, fontFamily: "Helvetica-Bold" },
  box: { backgroundColor: brand.colors[50], padding: 10, borderRadius: 4, marginTop: 6 },
  grid: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  disclaimer: { marginTop: 16, padding: 8, border: `0.5pt solid ${brand.colors[300]}`, fontSize: 8, color: brand.muted, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7.5, color: brand.muted, flexDirection: "row", justifyContent: "space-between" },
});

function R({ k, v, b, neg }: { k: string; v: number; b?: boolean; neg?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={b ? s.strong : undefined}>{k}</Text>
      <Text style={b ? s.strong : undefined}>{neg && v ? `(${peso(v)})` : peso(v)}</Text>
    </View>
  );
}

function ComputationDoc({ c, meta }: { c: ComputationResult; meta: { buyer: string; development: string; items: string; version: number; preparedBy: string; createdAt: Date; validUntil: Date; disclaimer: string; ref: string } }) {
  return (
    <Document title={`Sample computation ${meta.ref}`} author={brand.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            <Svg width="22" height="22" viewBox="0 0 32 32">
              <Polygon points="16,2 29,10 29,22 16,30 3,22 3,10" fill={brand.colors[400]} stroke={brand.colors[700]} />
            </Svg>
            <View>
              <Text style={s.brandName}>{brand.name}</Text>
              <Text style={s.muted}>{brand.tagline}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.strong}>SAMPLE COMPUTATION</Text>
            <Text style={s.muted}>Ref {meta.ref} · v{meta.version}</Text>
            <Text style={s.muted}>Prepared {formatDate(meta.createdAt)}</Text>
          </View>
        </View>
        <View style={s.grid}>
          <View style={s.col}>
            <Text style={s.muted}>Prepared for</Text>
            <Text style={s.strong}>{meta.buyer}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.muted}>Property</Text>
            <Text style={s.strong}>{meta.development}</Text>
            <Text>{meta.items}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.muted}>Payment scheme</Text>
            <Text style={s.strong}>{c.schemeName}</Text>
          </View>
        </View>

        <Text style={s.h2}>Price</Text>
        {c.lines.map((l) => (
          <R key={l.code} k={`${l.kind === "PARKING" ? "Parking" : "Unit"} ${l.code} — list price`} v={l.listPriceCents} />
        ))}
        {c.promoDiscountCents > 0 && <R k="Less: promo discount" v={c.promoDiscountCents} neg />}
        {c.spotCashDiscountCents > 0 && <R k="Less: spot cash discount" v={c.spotCashDiscountCents} neg />}
        <View style={s.total}>
          <Text>Net selling price</Text>
          <Text>{peso(c.netSellingPriceCents)}</Text>
        </View>
        <R k={c.vatIncludedInPrice ? `VAT ${c.vatRatePct}% (included)` : `Add: VAT ${c.vatRatePct}%${c.vatCents ? "" : " (VAT-exempt)"}`} v={c.vatCents} />
        <R k={`${c.miscFeesInTcp ? "Add: " : ""}Other charges / misc. fees (${c.miscFeesPct}%)${c.miscFeesInTcp ? "" : " — payable separately"}`} v={c.miscFeesCents} />
        <View style={s.total}>
          <Text>TOTAL CONTRACT PRICE (TCP)</Text>
          <Text>{peso(c.tcpCents)}</Text>
        </View>

        <Text style={s.h2}>Payment terms</Text>
        <View style={s.box}>
          <R k="Reservation fee" v={c.reservationFeeCents} />
          {c.schemeKind === "SPOT_CASH" && <R k="Balance payable (spot cash)" v={c.spotBalanceCents} b />}
          {c.schemeKind === "DEFERRED_CASH" && <R k={`${c.deferredMonths} equal monthly payments of`} v={c.deferredMonthlyCents} b />}
          {c.schemeKind === "DP_BALANCE" && (
            <>
              <R k={`Down payment (${c.dpPct}% of TCP)`} v={c.dpGrossCents} />
              <R k="Less: reservation fee" v={c.reservationFeeCents} neg />
              {c.spotDpDiscountCents > 0 && <R k="Less: spot DP discount" v={c.spotDpDiscountCents} neg />}
              <R k="Net down payment" v={c.dpNetPayableCents} />
              {c.dpMonths > 0 ? <R k={`Monthly down payment × ${c.dpMonths} months`} v={c.dpMonthlyCents} b /> : <R k="Spot down payment" v={c.dpNetPayableCents} b />}
              <R k={`Balance (${100 - c.dpPct}%) via ${label(c.financing)}`} v={c.balanceCents} b />
            </>
          )}
        </View>

        {c.amortization.length > 0 && (
          <>
            <Text style={s.h2}>Estimated monthly amortization on the balance</Text>
            {c.amortization.map((a) => (
              <View key={a.financing} style={s.row}>
                <Text style={a.isSchemeFinancing ? s.strong : undefined}>
                  {label(a.financing)} — {a.ratePct}% p.a., {a.termMonths / 12} years
                </Text>
                <Text style={a.isSchemeFinancing ? s.strong : undefined}>{peso(a.monthlyCents)} / month</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.disclaimer}>
          <Text style={s.strong}>Prices valid until {formatDateTime(meta.validUntil)}. Subject to change without prior notice.</Text>
          <Text>{meta.disclaimer}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>
            Prepared by {meta.preparedBy} · {brand.name}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderComputationPdf(id: string): Promise<{ buffer: Buffer; fileName: string }> {
  const c = await prisma.sampleComputation.findUniqueOrThrow({ where: { id }, include: { lead: true, client: true, development: true } });
  const creator = c.createdById ? await prisma.user.findUnique({ where: { id: c.createdById }, select: { name: true } }) : null;
  const inputs = c.inputs as any;
  const buyer = c.client ? fullName(c.client) : c.lead ? fullName(c.lead) : "Prospective buyer";
  const ref = `SC-${c.id.slice(-6).toUpperCase()}`;
  const buffer = await renderToBuffer(
    <ComputationDoc
      c={c.result as unknown as ComputationResult}
      meta={{
        buyer,
        development: c.development.name,
        items: (inputs.items ?? []).map((i: any) => i.code).join(" + "),
        version: c.version,
        preparedBy: creator?.name ?? brand.name,
        createdAt: c.createdAt,
        validUntil: c.validUntil,
        disclaimer: inputs.disclaimer ?? "",
        ref,
      }}
    />,
  );
  return { buffer: Buffer.from(buffer), fileName: `Citrineland-Sample-Computation-${ref}-v${c.version}.pdf` };
}
