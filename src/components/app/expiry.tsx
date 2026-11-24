import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/lib/format";

/** Expiry indicator for PRC licenses / accreditation */
export function ExpiryBadge({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>;
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  const variant = days < 0 ? "danger" : days <= 30 ? "warning" : days <= 60 ? "info" : "secondary";
  const text = days < 0 ? `Expired ${-days}d ago` : days === 0 ? "Expires today" : days <= 60 ? `${days}d left` : formatDay(date);
  return (
    <Badge variant={variant as any} title={formatDay(date)}>
      {text}
    </Badge>
  );
}
