"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { sendEmail } from "@/server/actions/email";

function toHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function ComposeEmailButton({
  to,
  leadId,
  clientId,
  brokerId,
  transactionId,
  computationId,
  defaultSubject = "",
  defaultBody = "",
  label = "Email",
}: {
  to: string[];
  leadId?: string;
  clientId?: string;
  brokerId?: string;
  transactionId?: string;
  computationId?: string;
  defaultSubject?: string;
  defaultBody?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [toStr, setTo] = React.useState(to.join(", "));
  const [cc, setCc] = React.useState("");
  const [subject, setSubject] = React.useState(defaultSubject);
  const [body, setBody] = React.useState(defaultBody);
  const split = (s: string) =>
    s
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>Sent from your own Outlook mailbox and logged on the timeline.{computationId ? " The sample computation PDF is attached." : ""}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sendEmail({ to: split(toStr), cc: split(cc), subject, bodyHtml: toHtml(body), leadId, clientId, brokerId, transactionId, computationId });
              if (r.ok) {
                toast.success(r.message ?? "Sent");
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={toStr} onChange={(e) => setTo(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Cc</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
