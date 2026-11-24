import type { CurrentUser } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";

// Implemented in Phase 5 (commissions).
export async function CommissionLedgerPanel(_props: { transactionId: string; user: CurrentUser }) {
  return (
    <Card>
      <CardContent className="pt-4 text-sm text-muted-foreground">Commission ledger coming in Phase 5.</CardContent>
    </Card>
  );
}
