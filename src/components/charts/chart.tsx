"use client";

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { chartColors } from "@/config/brand";
import type { ChartSpec } from "@/server/reports/core";

function fmt(v: number, format?: ChartSpec["format"], compact = false) {
  if (format === "money") {
    const p = v / 100;
    if (compact) return Math.abs(p) >= 1e6 ? `₱${(p / 1e6).toFixed(1)}M` : Math.abs(p) >= 1e3 ? `₱${(p / 1e3).toFixed(0)}K` : `₱${p.toFixed(0)}`;
    return `₱${p.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "pct") return `${v.toFixed(1)}%`;
  return v.toLocaleString("en-PH", { maximumFractionDigits: 1 });
}

/** One-axis chart: vertical bars, horizontal bars (ranked categories) or lines. Colors by fixed series order. */
export function Chart({ spec, height = 260 }: { spec: ChartSpec; height?: number }) {
  const color = (i: number) => (spec.series.length === 1 ? chartColors.single : chartColors.categorical[i]);
  const tooltip = (
    <Tooltip
      cursor={{ fill: "rgba(120,113,108,0.08)" }}
      formatter={(v: number, name: string) => [fmt(Number(v), spec.format), name]}
      contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12, color: chartColors.ink }}
    />
  );
  const legend = spec.series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: chartColors.ink }} /> : null;
  if (!spec.data.length) return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data</div>;

  if (spec.kind === "hbar") {
    const h = Math.max(120, spec.data.length * 32 + 30);
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={spec.data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={chartColors.grid} />
          <XAxis type="number" allowDecimals={spec.format !== "number"} tickFormatter={(v) => fmt(v, spec.format, true)} tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={spec.x} width={150} tick={{ fontSize: 11, fill: chartColors.ink }} axisLine={false} tickLine={false} />
          {tooltip}
          {spec.series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} radius={[0, 4, 4, 0]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (spec.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={spec.data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey={spec.x} tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={spec.format !== "number"} tickFormatter={(v) => fmt(v, spec.format, true)} tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} width={64} />
          {tooltip}
          {legend}
          {spec.series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={color(i)} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={spec.data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey={spec.x} tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={spec.format !== "number"} tickFormatter={(v) => fmt(v, spec.format, true)} tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} width={64} />
        {tooltip}
        {legend}
        {spec.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} radius={[4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
