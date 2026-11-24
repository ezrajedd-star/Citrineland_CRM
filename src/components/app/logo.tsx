import { brand } from "@/config/brand";

/** Logo placeholder — replace /public/brand/logo.svg with the official Citrineland logo. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <polygon points="16,2 29,10 29,22 16,30 3,22 3,10" fill={brand.colors[400]} stroke={brand.colors[700]} strokeWidth="1.5" />
        <polygon points="16,2 29,10 16,16 3,10" fill={brand.colors[200]} opacity="0.9" />
        <line x1="16" y1="16" x2="16" y2="30" stroke={brand.colors[700]} strokeWidth="1" opacity="0.6" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}
