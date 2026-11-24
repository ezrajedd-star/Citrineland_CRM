import { Mail, MailOpen, Phone, Users, MapPin, StickyNote, CheckSquare, ArrowRightLeft, Cog, ExternalLink } from "lucide-react";
import { getTimeline } from "@/server/activities";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/labels";
import { EmptyState } from "./page";
import { FormDialog } from "./form-dialog";
import { addActivity } from "@/server/actions/crm";
import type { FieldDef } from "./entity-form";

const ICONS: Record<string, any> = { NOTE: StickyNote, CALL: Phone, MEETING: Users, SITE_VISIT: MapPin, EMAIL_IN: MailOpen, EMAIL_OUT: Mail, TASK: CheckSquare, STATUS_CHANGE: ArrowRightLeft, SYSTEM: Cog };

const activityFields: FieldDef[] = [
  { name: "leadId", label: "", type: "hidden" },
  { name: "clientId", label: "", type: "hidden" },
  { name: "brokerId", label: "", type: "hidden" },
  { name: "transactionId", label: "", type: "hidden" },
  {
    name: "type",
    label: "Type",
    type: "select",
    emptyOption: false,
    options: [
      { value: "NOTE", label: "Note" },
      { value: "CALL", label: "Call" },
      { value: "MEETING", label: "Meeting" },
      { value: "SITE_VISIT", label: "Site visit / tripping" },
    ],
  },
  { name: "occurredAt", label: "When", type: "datetime", help: "Blank = now" },
  { name: "subject", label: "Subject", required: true, span: 2 },
  { name: "body", label: "Details", type: "textarea", span: 2 },
  { name: "endsAt", label: "Ends (meetings)", type: "datetime" },
  { name: "location", label: "Location" },
  { name: "createOutlookEvent", label: "Add to my Outlook calendar", type: "checkbox" },
  { name: "inviteContact", label: "Invite the contact", type: "checkbox" },
];

export async function Timeline({ filter, canAdd }: { filter: { leadId?: string; clientId?: string; brokerId?: string; transactionId?: string }; canAdd: boolean }) {
  const items = await getTimeline(filter);
  return (
    <div className="space-y-3">
      {canAdd && (
        <div className="flex justify-end">
          <FormDialog title="Log activity" triggerLabel="Log activity" schema="activity" fields={activityFields} action={addActivity} defaultValues={{ type: "NOTE", ...filter }} wide successMessage="Logged" />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="No activity yet" description="Notes, calls, meetings, site visits and Outlook emails will appear here." />
      ) : (
        <ol className="relative space-y-4 border-l border-stone-200 pl-6">
          {items.map((a) => {
            const Icon = ICONS[a.type] ?? StickyNote;
            const meta = (a.meta ?? {}) as Record<string, any>;
            return (
              <li key={a.id} className="relative">
                <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border bg-white text-stone-500">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-stone-800">{a.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {label(a.type)} · {formatDateTime(a.occurredAt)} · {a.actor?.name ?? "System"}
                  </span>
                </div>
                {meta.participants && <div className="text-xs text-muted-foreground">{meta.participants}</div>}
                {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{a.body}</p>}
                {(meta.outlookLink || meta.webLink) && (
                  <a href={meta.outlookLink ?? meta.webLink} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                    Open in Outlook <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
