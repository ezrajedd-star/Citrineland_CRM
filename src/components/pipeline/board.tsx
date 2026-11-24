"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle, User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EntityForm } from "@/components/app/entity-form";
import { moveStage } from "@/server/actions/crm";

export interface BoardStage {
  id: string;
  name: string;
  color: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  stalledAfterDays: number;
  total: number;
}
export interface BoardCard {
  id: string;
  stageId: string;
  name: string;
  broker: string | null;
  owner: string | null;
  developments: string;
  budget: string | null;
  daysInStage: number;
  source: string;
}

export function PipelineBoard({ stages, cards, lostReasons }: { stages: BoardStage[]; cards: BoardCard[]; lostReasons: { value: string; label: string }[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(cards);
  const [lostFor, setLostFor] = React.useState<{ leadId: string; stageId: string } | null>(null);
  React.useEffect(() => setItems(cards), [cards]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const onDragEnd = async (e: DragEndEvent) => {
    const leadId = String(e.active.id);
    const toStage = e.over ? stages.find((s) => s.id === e.over!.id) : null;
    const card = items.find((c) => c.id === leadId);
    if (!toStage || !card || card.stageId === toStage.id) return;
    if (toStage.isWon) {
      // Reservation is a guided flow: select unit, hold → reserve, scheme, broker of record.
      router.push(`/transactions/new?leadId=${leadId}`);
      return;
    }
    if (toStage.isLost) {
      setLostFor({ leadId, stageId: toStage.id });
      return;
    }
    const prev = items;
    setItems((xs) => xs.map((c) => (c.id === leadId ? { ...c, stageId: toStage.id, daysInStage: 0 } : c)));
    const r = await moveStage({ leadId, stageId: toStage.id });
    if (!r.ok) {
      setItems(prev);
      toast.error(r.error);
    } else router.refresh();
  };

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => (
            <Column key={s.id} stage={s} cards={items.filter((c) => c.stageId === s.id)} />
          ))}
        </div>
      </DndContext>
      <Dialog open={!!lostFor} onOpenChange={(o) => !o && setLostFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark lead as lost</DialogTitle>
            <DialogDescription>Select why the lead was lost. This feeds the lost-reasons report.</DialogDescription>
          </DialogHeader>
          {lostFor && (
            <EntityForm
              schema="moveStage"
              columns={1}
              action={moveStage}
              defaultValues={lostFor}
              submitLabel="Mark as lost"
              destructive
              onSuccess={() => setLostFor(null)}
              fields={[
                { name: "leadId", label: "", type: "hidden" },
                { name: "stageId", label: "", type: "hidden" },
                { name: "lostReasonCode", label: "Lost reason", type: "select", options: lostReasons, required: true },
                { name: "lostNotes", label: "Notes", type: "textarea" },
              ]}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({ stage, cards }: { stage: BoardStage; cards: BoardCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-stone-100/70", isOver && "ring-2 ring-brand-400")}>
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderTop: `3px solid ${stage.color}`, borderRadius: "0.5rem 0.5rem 0 0" }}>
        <div className="text-sm font-semibold text-stone-800">{stage.name}</div>
        <div className="text-xs text-stone-500">
          {stage.total} · {stage.probability}%
        </div>
      </div>
      <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {cards.map((c) => (
          <Card key={c.id} card={c} stalled={!stage.isWon && !stage.isLost && c.daysInStage > stage.stalledAfterDays} />
        ))}
        {stage.isWon && <div className="rounded border border-dashed p-3 text-center text-xs text-stone-500">Drop here to start a reservation</div>}
        {stage.total > cards.length && <div className="text-center text-xs text-stone-500">+{stage.total - cards.length} more — use list view</div>}
      </div>
    </div>
  );
}

function Card({ card, stalled }: { card: BoardCard; stalled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab rounded-md border bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing", isDragging && "z-50 opacity-80 shadow-lg", stalled && "border-amber-400 bg-amber-50")}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/pipeline/leads/${card.id}`} className="font-medium text-stone-900 hover:text-brand-700 hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {card.name}
        </Link>
        {stalled && (
          <span title={`Stalled: ${card.daysInStage} days in stage`}>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </span>
        )}
      </div>
      {card.developments && (
        <div className="mt-1 flex items-center gap-1 text-xs text-stone-600">
          <Building2 className="h-3 w-3" />
          {card.developments}
        </div>
      )}
      <div className="mt-1 flex items-center gap-1 text-xs text-stone-500">
        <User className="h-3 w-3" /> {card.broker ?? "Direct"} · {card.owner ?? "Unassigned"}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-stone-500">
        <span>{card.budget ?? card.source}</span>
        <span className={cn(stalled && "font-medium text-amber-700")}>{card.daysInStage}d in stage</span>
      </div>
    </div>
  );
}
