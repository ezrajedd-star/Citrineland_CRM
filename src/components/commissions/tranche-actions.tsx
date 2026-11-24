"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { approve, release } from "@/server/actions/commissions";

/** Approve (DUE → APPROVED) or release (APPROVED → RELEASED with a check/voucher reference). */
export function TrancheActions({ ids, status, canApprove, canRelease, bulk }: { ids: string[]; status: string; canApprove: boolean; canRelease: boolean; bulk?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [ref, setRef] = React.useState("");
  if (!ids.length) return null;
  const run = (fn: () => Promise<any>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <>
      {status === "DUE" && canApprove && (
        <Button size="sm" variant={bulk ? "default" : "outline"} disabled={pending} onClick={() => run(() => approve({ trancheIds: ids }))}>
          Approve{bulk ? ` ${ids.length}` : ""}
        </Button>
      )}
      {status === "APPROVED" && canRelease && (
        <>
          <Button size="sm" variant={bulk ? "default" : "outline"} onClick={() => setOpen(true)}>
            Release{bulk ? ` ${ids.length}` : ""}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Release commission</DialogTitle>
                <DialogDescription>Record the check or voucher number used to pay {ids.length} tranche(s).</DialogDescription>
              </DialogHeader>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Check / voucher no." autoFocus />
              <DialogFooter>
                <Button disabled={pending || !ref.trim()} onClick={() => run(() => release({ trancheIds: ids, reference: ref.trim() }))}>
                  Record release
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
