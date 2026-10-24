import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { RpgHabit } from '@workspace/api-client-react';
import { useRpg } from '@/lib/rpg-context';
import { Meter, cx } from '@/components/kit';
import { PhotoProofButton } from '@/components/photo-proof';

export function HabitProgress({ habit }: { habit: RpgHabit }) {
  const { snap, run, isPending } = useRpg();
  const [draft, setDraft] = useState('');
  const busy = isPending(`progressHabit:${habit.id}`);
  const done = habit.progress >= habit.target;
  const locked = !habit.scheduledToday || habit.archived;
  const set = (v: number) => void run({ action: 'progressHabit', id: habit.id, value: v, date: snap?.today }, { optimistic: (s) => ({ ...s, habits: s.habits.map((h) => (h.id === habit.id ? { ...h, progress: v } : h)) }) });
  const step = Math.max(1, Math.round(habit.target / 10));
  if (habit.requiresPhotoProof) {
    return done
      ? <button type="button" data-testid={`button-complete-habit-${habit.id}`} disabled={busy || locked} aria-pressed aria-label={`Undo ${habit.title}`} onClick={() => set(0)}
          className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[color:var(--pq-cyan)] bg-[color:var(--pq-cyan)] text-[color:var(--pq-panel2)] disabled:opacity-40"><Check size={18}/></button>
      : <PhotoProofButton itemType="habit" itemId={habit.id} title={habit.title} disabled={busy || locked}/>;
  }
  if (habit.target === 1) {
    return <button type="button" data-testid={`button-complete-habit-${habit.id}`} disabled={busy || locked} aria-pressed={done} aria-label={`${done ? 'Undo' : 'Complete'} ${habit.title}`} onClick={() => set(done ? 0 : 1)}
      className={cx('grid h-9 w-9 shrink-0 place-items-center border-2 transition-colors disabled:opacity-40', done ? 'border-[color:var(--pq-cyan)] bg-[color:var(--pq-cyan)] text-[color:var(--pq-panel2)]' : 'border-[color:var(--pq-mute)] text-[color:var(--pq-mute)] hover:border-[color:var(--pq-cyan)] hover:text-[color:var(--pq-cyan)]')}><Check size={18}/></button>;
  }
  return <div className="w-full sm:w-56">
    <div className="mb-1 flex justify-between font-mono text-[10px] text-[color:var(--pq-ink)]"><span data-testid={`text-progress-${habit.id}`}>{habit.progress} / {habit.target} {habit.unit}</span>{done && <span className="text-[color:var(--pq-cyan)]">DONE</span>}</div>
    <Meter value={Math.min(habit.progress, habit.target)} max={habit.target} color={done ? 'var(--pq-cyan)' : 'var(--pq-gold)'} label={`${habit.title} progress`}/>
    <div className="mt-2 flex items-center gap-1">
      <button type="button" data-testid={`button-progress-minus-${habit.id}`} aria-label="Decrease" disabled={busy || locked || habit.progress <= 0} onClick={() => set(Math.max(0, habit.progress - step))} className="grid h-8 w-8 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-ink2)] disabled:opacity-40"><Minus size={14}/></button>
      <button type="button" data-testid={`button-progress-plus-${habit.id}`} aria-label="Increase" disabled={busy || locked || habit.progress >= habit.target} onClick={() => set(Math.min(habit.target, habit.progress + step))} className="grid h-8 w-8 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-ink2)] disabled:opacity-40"><Plus size={14}/></button>
      <input type="number" min={0} aria-label="Exact quantity" data-testid={`input-progress-${habit.id}`} value={draft} placeholder={String(habit.progress)} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft !== '') { set(Math.max(0, Number(draft))); setDraft(''); } }} className="field !w-16 !px-2 !py-1.5 text-center" disabled={locked}/>
      <button type="button" data-testid={`button-progress-set-${habit.id}`} disabled={busy || locked || draft === ''} onClick={() => { set(Math.max(0, Number(draft))); setDraft(''); }} className="border border-[color:var(--pq-mute)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--pq-gold)] disabled:opacity-40">SET</button>
    </div>
  </div>;
}
