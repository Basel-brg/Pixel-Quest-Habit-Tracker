import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { RpgQuest, RpgActionInputDifficulty, RpgActionInputType } from '@workspace/api-client-react';
import { Btn, Empty, Field, Gate, Modal, PageHead, Panel, cx, fmtDate } from '@/components/kit';
import { useRpg } from '@/lib/rpg-context';

interface Draft { id?: number; title: string; category: string; difficulty: RpgActionInputDifficulty; priority: boolean; dueDate: string; tags: string; type: RpgActionInputType }
const blank: Draft = { title: '', category: 'General', difficulty: 'easy', priority: false, dueDate: '', tags: '', type: 'single' };
const diffColor = { easy: 'text-[color:var(--pq-cyan)]', medium: 'text-[color:var(--pq-gold)]', hard: 'text-[color:var(--pq-danger)]' };

export default function QuestsPage() {
  const { run, isPending } = useRpg();
  const [status, setStatus] = useState<'active' | 'completed' | 'all'>('active'); const [diff, setDiff] = useState('all'); const [type, setType] = useState('all'); const [tag, setTag] = useState('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const open = (q?: RpgQuest) => setDraft(q ? { id: q.id, title: q.title, category: q.category, difficulty: q.difficulty, priority: q.priority, dueDate: q.dueDate?.slice(0, 10) ?? '', tags: q.tags.join(', '), type: q.type } : blank);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!draft) return;
    const tags = [...new Set(draft.tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 10);
    const r = await run({ action: 'saveQuest', id: draft.id, title: draft.title.trim(), category: draft.category.trim() || 'General', difficulty: draft.difficulty, priority: draft.priority, dueDate: draft.dueDate || null, tags, type: draft.type }, { key: 'saveQuest:editor' });
    if (r) setDraft(null);
  };
  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const chip = (on: boolean) => cx('border px-3 py-2 text-xs font-bold capitalize', on ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-line2)] text-[color:var(--pq-gold)]' : 'border-[color:var(--pq-line)] text-[color:var(--pq-mute)]');
  return <Gate>{(s) => {
    const allTags = [...new Set(s.quests.flatMap((q) => q.tags))].sort();
    const list = s.quests.filter((q) => (status === 'all' || q.status === status) && (diff === 'all' || q.difficulty === diff) && (type === 'all' || q.type === type) && (tag === 'all' || q.tags.includes(tag)));
    return <>
      <PageHead eyebrow="One step at a time" title="Quest board" sub="Easy 10 XP / 5 G, medium 25 / 15, hard 50 / 35. The payout freezes the first time you complete a quest." action={<Btn testId="button-add-quest" onClick={() => open()}><Plus size={16}/> New quest</Btn>}/>
      <Panel>
        <div className="space-y-3 border-b border-[color:var(--pq-line3)] pb-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Status">{(['active', 'completed', 'all'] as const).map((x) => <button key={x} data-testid={`filter-status-${x}`} aria-pressed={status === x} onClick={() => setStatus(x)} className={chip(status === x)}>{x}</button>)}</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Difficulty">{['all', 'easy', 'medium', 'hard'].map((x) => <button key={x} data-testid={`filter-difficulty-${x}`} aria-pressed={diff === x} onClick={() => setDiff(x)} className={chip(diff === x)}>{x}</button>)}</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type">{['all', 'single', 'weekly'].map((x) => <button key={x} data-testid={`filter-type-${x}`} aria-pressed={type === x} onClick={() => setType(x)} className={chip(type === x)}>{x === 'all' ? 'any type' : x}</button>)}</div>
          {allTags.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">{['all', ...allTags].map((x) => <button key={x} data-testid={`filter-tag-${x}`} aria-pressed={tag === x} onClick={() => setTag(x)} className={chip(tag === x)}>{x === 'all' ? 'any tag' : `#${x}`}</button>)}</div>}</div>
        {list.length ? <div className="divide-y divide-[color:var(--pq-line3)]">{list.map((q) => { const done = q.status === 'completed'; return <div key={q.id} data-testid={`quest-row-${q.id}`} className="flex items-center gap-3 py-4">
          <button data-testid={`button-complete-task-${q.id}`} disabled={isPending(`completeQuest:${q.id}`)} aria-label={`${done ? 'Reopen' : 'Complete'} ${q.title}`} onClick={() => void run({ action: 'completeQuest', id: q.id, completed: !done }, { optimistic: (x) => ({ ...x, quests: x.quests.map((y) => (y.id === q.id ? { ...y, status: done ? 'active' : 'completed' } : y)) }) })} className={cx('grid h-8 w-8 shrink-0 place-items-center border-2 disabled:opacity-40', done ? 'border-[color:var(--pq-cyan)] bg-[color:var(--pq-cyan)] text-[color:var(--pq-panel2)]' : 'border-[color:var(--pq-mute)] text-[color:var(--pq-mute)] hover:border-[color:var(--pq-gold)] hover:text-[color:var(--pq-gold)]')}>{done ? <RotateCcw size={14}/> : <Check size={15}/>}</button>
          <div className="min-w-0 flex-1"><p className={cx('text-sm font-semibold', done && 'text-[color:var(--pq-mute2)] line-through')}>{q.priority && <b className="mr-2 text-[color:var(--pq-danger)]">!</b>}{q.title}</p>
            <p className="mt-1 text-[11px] text-[color:var(--pq-mute)]"><span className={cx('font-mono uppercase', diffColor[q.difficulty])}>{q.difficulty}</span> · {q.type} · {q.category} · {q.xpReward} XP / {q.goldReward} G{q.dueDate && ` · due ${fmtDate(q.dueDate)}`}</p>
            {q.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{q.tags.map((t) => <span key={t} className="border border-[color:var(--pq-line2)] px-1.5 text-[10px] text-[color:var(--pq-cyan)]">#{t}</span>)}</p>}</div>
          <button data-testid={`button-edit-task-${q.id}`} aria-label={`Edit ${q.title}`} onClick={() => open(q)} className="grid h-8 w-8 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-mute2)] hover:text-[color:var(--pq-gold)]"><Pencil size={14}/></button>
          <button data-testid={`button-delete-task-${q.id}`} aria-label={`Delete ${q.title}`} disabled={isPending(`deleteQuest:${q.id}`)} onClick={() => { if (window.confirm(`Delete "${q.title}"?`)) void run({ action: 'deleteQuest', id: q.id }); }} className="grid h-8 w-8 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-mute2)] hover:text-[color:var(--pq-danger)] disabled:opacity-40"><Trash2 size={14}/></button></div>; })}</div>
          : <div className="pt-5"><Empty title="NO QUESTS HERE" detail="Nothing matches these filters yet." action={<Btn testId="button-empty-add-quest" onClick={() => open()}><Plus size={15}/> Add a quest</Btn>}/></div>}</Panel>
      {draft && <Modal title={draft.id ? 'Edit quest' : 'New quest'} onClose={() => setDraft(null)}><form onSubmit={(e) => void save(e)} className="space-y-4">
        <Field label="Quest"><input autoFocus required maxLength={120} data-testid="input-quest-title" value={draft.title} onChange={(e) => upd('title', e.target.value)} className="field"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><input required maxLength={40} data-testid="input-quest-category" value={draft.category} onChange={(e) => upd('category', e.target.value)} className="field"/></Field>
          <Field label="Difficulty"><select data-testid="select-quest-difficulty" value={draft.difficulty} onChange={(e) => upd('difficulty', e.target.value as RpgActionInputDifficulty)} className="field"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Type"><select data-testid="select-quest-type" value={draft.type} onChange={(e) => upd('type', e.target.value as RpgActionInputType)} className="field"><option value="single">Single</option><option value="weekly">Weekly</option></select></Field>
          <Field label="Due date"><input type="date" data-testid="input-quest-due" value={draft.dueDate} onChange={(e) => upd('dueDate', e.target.value)} className="field"/></Field></div>
        <Field label="Tags" hint="Comma separated, up to 10."><input data-testid="input-quest-tags" value={draft.tags} onChange={(e) => upd('tags', e.target.value)} className="field"/></Field>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" data-testid="checkbox-quest-priority" checked={draft.priority} onChange={(e) => upd('priority', e.target.checked)} className="h-4 w-4 accent-[color:var(--pq-gold)]"/>Priority quest</label>
        <div className="flex justify-end gap-2"><Btn testId="button-cancel-quest" variant="quiet" onClick={() => setDraft(null)}>Cancel</Btn><Btn testId="button-save-quest" type="submit" disabled={isPending('saveQuest:editor')}>{isPending('saveQuest:editor') ? 'Saving...' : 'Save quest'}</Btn></div></form></Modal>}
    </>;
  }}</Gate>;
}
