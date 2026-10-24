import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { ManualDraft, ManualDraftKind } from "@/lib/offline-drafts";
import { Btn, Panel, SectionHead } from "@/components/kit";

interface Props {
  kind: ManualDraftKind;
  drafts: ManualDraft[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (draft: ManualDraft) => void;
}

export function OfflineDraftList({ kind, drafts, onRetry, onRemove, onEdit }: Props) {
  const items = drafts.filter(draft => draft.kind === kind);
  if (!items.length) return null;
  return <Panel data-testid={`panel-offline-${kind}-drafts`}>
    <SectionHead eyebrow="SAVED ON THIS DEVICE" title={`${kind === "task" ? "Quest" : "Habit"} drafts`}/>
    <div className="divide-y divide-[color:var(--pq-line3)]">
      {items.map(draft => <article key={draft.id} data-testid={`card-offline-draft-${draft.id}`} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p data-testid={`text-offline-draft-title-${draft.id}`} className="truncate text-sm font-semibold">{draft.input.title}</p>
          <p data-testid={`status-offline-draft-${draft.id}`} className={`mt-1 text-[10px] font-mono uppercase ${draft.status === "failed" ? "text-[color:var(--pq-danger)]" : draft.status === "syncing" ? "text-[color:var(--pq-cyan)]" : "text-[color:var(--pq-gold)]"}`}>
            {draft.status === "failed" ? "Sync failed · retry when online" : draft.status === "syncing" ? "Syncing…" : "Waiting for connection"}
          </p>
        </div>
        <div className="flex gap-1">
          {draft.status === "failed" && <Btn testId={`button-retry-draft-${draft.id}`} variant="quiet" className="!px-2 !py-1.5 text-xs" onClick={() => onRetry(draft.id)}><RefreshCw size={13}/> Retry</Btn>}
          <Btn testId={`button-edit-draft-${draft.id}`} variant="quiet" className="!px-2 !py-1.5 text-xs" onClick={() => onEdit(draft)}><Pencil size={13}/> Edit</Btn>
          <Btn testId={`button-remove-draft-${draft.id}`} variant="quiet" className="!px-2 !py-1.5 text-xs" onClick={() => onRemove(draft.id)}><Trash2 size={13}/> Remove</Btn>
        </div>
      </article>)}
    </div>
  </Panel>;
}
