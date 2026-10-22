import { useState, type FormEvent } from 'react';
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react';
import type { RpgHabit, RpgActionInputFrequency, RpgActionInputStat } from '@workspace/api-client-react';
import { Btn, Empty, Field, Gate, Modal, PageHead, Panel, SectionHead, cx, weekDays } from '@/components/kit';
import { HabitProgress } from '@/components/habit-progress';
import { useRpg } from '@/lib/rpg-context';
import { useReminders } from '@/lib/reminders';

interface Draft { id?: number; title: string; category: string; frequency: RpgActionInputFrequency; days: number[]; mandatory: boolean; target: number; unit: string; stat: RpgActionInputStat; archived: boolean }
const blank: Draft = { title: '', category: 'Wellbeing', frequency: 'daily', days: [1, 2, 3, 4, 5], mandatory: false, target: 1, unit: 'time', stat: 'STR', archived: false };
const dayColor: Record<string, string> = { complete: '#73e6df', partial: '#f5ca62', missed: '#f29b83', off: '#2c2940', protected: '#b497f7', upcoming: '#3b3752' };

function Reminder({ habit }: { habit: RpgHabit }) {
  const { prefs, setTime, permission } = useReminders();
  const t = prefs.times[String(habit.id)] ?? '';
  return <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#928ba4]"><label htmlFor={`rem-${habit.id}`}>Browser reminder</label>
    <input id={`rem-${habit.id}`} type="time" data-testid={`input-reminder-${habit.id}`} value={t} onChange={(e) => setTime(habit.id, e.target.value || null)} className="field !w-28 !px-2 !py-1"/>
    {t && <button type="button" data-testid={`button-clear-reminder-${habit.id}`} onClick={() => setTime(habit.id, null)} className="text-[#73e6df]">Clear</button>}
    {t && permission === 'denied' && <span className="text-[#f29b83]">Notifications are blocked in this browser.</span>}</div>;
}

export default function HabitsPage() {
  const { run, isPending, snap } = useRpg();
  const [draft, setDraft] = useState<Draft | null>(null); const [archivedView, setArchivedView] = useState(false); const [err, setErr] = useState('');
  const open = (h?: RpgHabit) => { setErr(''); setDraft(h ? { id: h.id, title: h.title, category: h.category, frequency: h.frequency, days: h.days, mandatory: h.mandatory, target: h.target, unit: h.unit, stat: h.stat, archived: h.archived } : blank); };
  const payload = (d: Draft) => ({ action: 'saveHabit' as const, id: d.id, title: d.title.trim(), category: d.category.trim(), frequency: d.frequency, days: d.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : d.days, mandatory: d.mandatory, target: Math.max(1, Number(d.target) || 1), unit: d.unit.trim() || 'time', stat: d.stat, archived: d.archived });
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!draft) return;
    if (draft.frequency === 'weekly' && !draft.days.length) { setErr('Pick at least one day.'); return; }
    const r = await run(payload(draft), { key: 'saveHabit:editor' }); if (r) setDraft(null);
  };
  const editing = draft?.id ? snap?.habits.find((h) => h.id === draft.id) : undefined;
  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  return <Gate>{(s) => {
    const list = s.habits.filter((h) => h.archived === archivedView);
    return <>
      <PageHead eyebrow="Build your character" title="Habit journal" sub="Binary or numeric, mapped to a stat. Partial numeric progress earns nothing until the target is reached." action={<Btn testId="button-add-habit" onClick={() => open()}><Plus size={16}/> New habit</Btn>}/>
      <Panel><SectionHead eyebrow="ROUTINES" title={archivedView ? 'Archived' : 'Habit roster'} action={<Btn testId="button-toggle-archived" variant="quiet" className="!px-3 !py-2 text-xs" onClick={() => setArchivedView((v) => !v)}><Archive size={14}/>{archivedView ? 'Show active' : 'Archived'}</Btn>}/>
        {list.length ? <div className="grid gap-3 lg:grid-cols-2">{list.map((h) => <article key={h.id} data-testid={`card-habit-${h.id}`} className="border border-[#49445d] bg-[#1c1a2b] p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold">{h.title}</h3>
            <p className="mt-1 text-[11px] text-[#89829b]">{h.category} · {h.stat} · {h.target} {h.unit} · {h.frequency === 'daily' ? 'daily' : h.days.map((d) => weekDays[d]).join(' ')}</p>
            <p className="mt-1 flex gap-2 font-mono text-[9px] uppercase"><span className={h.mandatory ? 'text-[#f29b83]' : 'text-[#928ba4]'}>{h.mandatory ? 'Mandatory' : 'Optional'}</span><span className="text-[#f5ca62]">streak {h.streak}</span><span className="text-[#928ba4]">best {h.bestStreak}</span></p></div>
            <div className="flex shrink-0 gap-1"><button data-testid={`button-edit-habit-${h.id}`} aria-label={`Edit ${h.title}`} onClick={() => open(h)} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f5ca62]"><Pencil size={14}/></button>
              <button data-testid={`button-archive-habit-${h.id}`} aria-label={h.archived ? 'Restore' : 'Archive'} disabled={isPending('saveHabit:' + h.id)} onClick={() => void run({ ...payload({ id: h.id, title: h.title, category: h.category, frequency: h.frequency, days: h.days, mandatory: h.mandatory, target: h.target, unit: h.unit, stat: h.stat, archived: !h.archived }) })} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#73e6df] disabled:opacity-40"><Archive size={14}/></button>
               <button data-testid={`button-delete-habit-${h.id}`} aria-label={`Delete ${h.title}`} disabled={isPending('deleteHabit:' + h.id)} onClick={() => { if (window.confirm(`Delete "${h.title}" from your roster? Earned history stays in your reports.`)) void run({ action: 'deleteHabit', id: h.id }); }} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f29b83] disabled:opacity-40"><Trash2 size={14}/></button></div></div>
          {!h.archived && <div className="mt-4"><HabitProgress habit={h}/></div>}
          <div className="mt-4" role="img" aria-label={`Last ${Math.min(30, h.history.length)} days: ${h.history.filter((d) => d.status === 'complete').length} complete, ${h.history.filter((d) => d.status === 'missed').length} missed`}>
            <div className="flex flex-wrap gap-[3px]">{h.history.slice(-30).map((d) => <i key={d.date} title={`${d.date}: ${d.status} (${d.value}/${d.target})`} data-testid={`day-${h.id}-${d.date}`} className="block h-3.5 w-3.5 border border-black/30" style={{ background: dayColor[d.status] }}/>)}</div>
            <p className="mt-2 text-[10px] text-[#837c96]">Cyan complete, gold partial, red missed, purple protected, dark off day. Past days are read-only.</p></div>
          {!h.archived && <Reminder habit={h}/>}</article>)}</div>
          : <Empty title={archivedView ? 'NO ARCHIVED HABITS' : 'NO ROUTINES YET'} detail={archivedView ? 'Archived habits keep their history here.' : 'Start with one small habit you would like to repeat.'} action={!archivedView && <Btn testId="button-empty-add-habit" onClick={() => open()}><Plus size={15}/> Add a habit</Btn>}/>}</Panel>
      {draft && <Modal title={draft.id ? 'Edit habit' : 'Create a habit'} onClose={() => setDraft(null)}>
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          {editing && editing.progress > 0 && <div data-testid="notice-clear-progress" className="border border-[#806b42] bg-[#2d2a35] p-3 text-xs text-[#f5ca62]">Today has progress logged ({editing.progress}/{editing.target}). Clear it before changing the habit shape.<div className="mt-2"><Btn testId="button-clear-progress" variant="quiet" className="!py-1.5 text-xs" disabled={isPending(`progressHabit:${editing.id}`)} onClick={() => void run({ action: 'progressHabit', id: editing.id, value: 0, date: s.today })}>Clear today's progress</Btn></div></div>}
          <Field label="Habit name"><input autoFocus required maxLength={120} data-testid="input-habit-title" value={draft.title} onChange={(e) => upd('title', e.target.value)} className="field"/></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><input required maxLength={40} data-testid="input-habit-category" value={draft.category} onChange={(e) => upd('category', e.target.value)} className="field"/></Field>
            <Field label="Stat"><select data-testid="select-habit-stat" value={draft.stat} onChange={(e) => upd('stat', e.target.value as RpgActionInputStat)} className="field"><option value="STR">STR (body)</option><option value="INT">INT (mind)</option><option value="WIS">WIS (spirit)</option></select></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Daily target" hint="1 makes a simple check-off."><input type="number" min={1} max={1000000} required data-testid="input-habit-target" value={draft.target} onChange={(e) => upd('target', Number(e.target.value))} className="field"/></Field>
            <Field label="Unit"><input maxLength={30} data-testid="input-habit-unit" value={draft.unit} onChange={(e) => upd('unit', e.target.value)} placeholder="pages, minutes..." className="field"/></Field></div>
          <Field label="Schedule"><select data-testid="select-habit-frequency" value={draft.frequency} onChange={(e) => upd('frequency', e.target.value as RpgActionInputFrequency)} className="field"><option value="daily">Every day</option><option value="weekly">Custom days</option></select></Field>
          {draft.frequency === 'weekly' && <fieldset><legend className="mb-2 text-xs font-bold text-[#b9b3c8]">Repeat on</legend><div className="flex flex-wrap gap-2">{weekDays.map((d, i) => <button type="button" key={d} data-testid={`button-day-${i}`} aria-pressed={draft.days.includes(i)} onClick={() => upd('days', draft.days.includes(i) ? draft.days.filter((x) => x !== i) : [...draft.days, i].sort())} className={cx('border px-3 py-2 text-xs font-bold', draft.days.includes(i) ? 'border-[#73e6df] bg-[#2b4546] text-[#9cf4ed]' : 'border-[#514967] text-[#9a93aa]')}>{d}</button>)}</div></fieldset>}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" data-testid="checkbox-habit-mandatory" checked={draft.mandatory} onChange={(e) => upd('mandatory', e.target.checked)} className="mt-1 h-4 w-4 accent-[#f5ca62]"/><span>Mandatory<span className="block text-[11px] text-[#837c96]">Each missed scheduled day costs 10 HP (a shield absorbs one).</span></span></label>
          {err && <p role="alert" className="text-xs text-[#f29b83]">{err}</p>}
          <div className="flex justify-end gap-2 pt-2"><Btn testId="button-cancel-habit" variant="quiet" onClick={() => setDraft(null)}>Cancel</Btn><Btn testId="button-save-habit" type="submit" disabled={isPending('saveHabit:editor')}>{isPending('saveHabit:editor') ? 'Saving...' : 'Save habit'}</Btn></div></form></Modal>}
    </>;
  }}</Gate>;
}
