import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BadgeCheck, ChevronDown, CircleDollarSign, Gift, LockKeyhole, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { useRewardAssistant } from '@workspace/api-client-react';
import type { RpgCondition, RpgConditionType, RpgReward } from '@workspace/api-client-react';
import { Btn, Empty, Field, Gate, Meter, Modal, PageHead, Panel, SectionHead, cx, fmtDate } from '@/components/kit';
import { useRpg } from '@/lib/rpg-context';

interface Draft { id?: number; title: string; description: string; category: string; conditions: RpgCondition[]; claimCost: number; savingsTarget: number; savedAmount: number; savingsPerQuest: number }
const blank: Draft = { title: '', description: '', category: 'Personal', conditions: [{ type: 'level', target: 2 }], claimCost: 0, savingsTarget: 0, savedAmount: 0, savingsPerQuest: 0 };

function Card({ r, gold }: { r: RpgReward; gold: number }) {
  const { run, isPending } = useRpg();
  const [saved, setSaved] = useState(''); const [open, setOpen] = useState(false); const [edit, setEdit] = useState<Draft | null>(null);
  const ready = r.status === 'ready'; const claimed = r.status === 'claimed'; const busy = isPending(`claimReward:${r.id}`) || isPending(`deleteReward:${r.id}`);
  const canAfford = gold >= r.claimCost;
  return <><article data-testid={`card-reward-${r.id}`} className={cx('quest-card flex flex-col border-2 p-5', claimed ? 'border-[color:var(--pq-mute)] bg-[color:var(--pq-panel2)]' : ready ? 'border-[color:var(--pq-mute)] bg-[linear-gradient(135deg,var(--pq-line2),var(--pq-panel))]' : 'border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)]')}>
    <div className="mb-3 flex items-start justify-between gap-3"><span className={cx('grid h-10 w-10 place-items-center border-2', claimed ? 'border-[color:var(--pq-mute)] text-[color:var(--pq-ink2)]' : ready ? 'border-[color:var(--pq-gold)] text-[color:var(--pq-gold)]' : 'border-[color:var(--pq-line)] text-[color:var(--pq-mute)]')}>{claimed ? <Trophy size={18}/> : ready ? <Gift size={18}/> : <LockKeyhole size={17}/>}</span>
      <span data-testid={`status-reward-${r.id}`} className="border border-[color:var(--pq-line)] px-2 py-1 font-mono text-[8px] uppercase text-[color:var(--pq-mute2)]">{claimed ? 'CLAIMED' : ready ? 'READY' : 'LOCKED'}</span></div>
    <p className="font-mono text-[8px] uppercase tracking-[.15em] text-[color:var(--pq-cyan)]">{r.category}</p><h3 data-testid={`text-reward-title-${r.id}`} className="text-base font-bold">{r.title}</h3>{r.description && <p className="mt-1 text-xs text-[color:var(--pq-mute)]">{r.description}</p>}
    <ul className="mt-3 space-y-1.5" aria-label="All conditions must be met">{r.conditions.map((c, i) => <li key={i} data-testid={`condition-${r.id}-${i}`} className="flex items-center gap-2 text-[11px] text-[color:var(--pq-ink2)]"><span className={cx('h-2.5 w-2.5 shrink-0 border', c.met ? 'border-[color:var(--pq-cyan)] bg-[color:var(--pq-cyan)]' : 'border-[color:var(--pq-mute)]')}/>{c.label ?? `${c.type} ${c.target}`}<span className="ml-auto font-mono text-[9px] text-[color:var(--pq-mute)]">{c.current ?? 0}/{c.target}</span></li>)}</ul>
    {r.claimCost > 0 && <p data-testid={`text-claim-cost-${r.id}`} className="mt-3 flex items-center gap-2 border border-[color:var(--pq-mute)] px-2 py-1.5 text-[11px] text-[color:var(--pq-gold)]"><CircleDollarSign size={13}/>Claim cost {r.claimCost} Gold, paid separately from the unlock conditions{!canAfford && !claimed && ` (you have ${gold})`}</p>}
    {r.savingsTarget > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-[color:var(--pq-mute)]"><span>Savings estimate (virtual)</span><span data-testid={`text-savings-${r.id}`}>{r.savedAmount} / {r.savingsTarget}</span></div><Meter value={r.savedAmount} max={r.savingsTarget} color="var(--pq-purple)" label="Savings progress"/>
      {r.savingsPerQuest > 0 && <p className="mt-1 text-[10px] text-[color:var(--pq-mute)]">Adds {r.savingsPerQuest} per completed quest.</p>}
      {!claimed && <div className="mt-2 flex gap-2"><input type="number" min={0} aria-label="Saved amount" data-testid={`input-savings-${r.id}`} value={saved} placeholder={String(r.savedAmount)} onChange={(e) => setSaved(e.target.value)} className="field !py-1.5"/><Btn testId={`button-savings-${r.id}`} variant="quiet" className="!px-3 !py-1.5 text-xs" disabled={saved === '' || isPending(`savings:${r.id}`)} onClick={() => void run({ action: 'savings', id: r.id, savedAmount: Math.max(0, Number(saved)) }).then((x) => { if (x) setSaved(''); })}>Update</Btn></div>}
      <p className="mt-1 text-[10px] text-[color:var(--pq-mute)]">Manual tracking only. This is not money and nothing is paid.</p></div>}
    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
      {claimed ? <span className="flex items-center gap-2 text-[11px] text-[color:var(--pq-mute)]"><BadgeCheck size={14} className="text-[color:var(--pq-cyan)]"/>{r.claimedAt ? fmtDate(r.claimedAt) : 'Claimed'}</span> : <>
        {ready && <Btn testId={`button-claim-reward-${r.id}`} className="flex-1 text-xs" disabled={busy || !canAfford} onClick={() => void run({ action: 'claimReward', id: r.id })}><Gift size={14}/>{isPending(`claimReward:${r.id}`) ? 'Claiming...' : r.claimCost ? `Claim for ${r.claimCost} Gold` : 'Claim reward'}</Btn>}
        <button data-testid={`button-edit-reward-${r.id}`} aria-label={`Edit ${r.title}`} disabled={busy} onClick={() => { setEdit({ id: r.id, title: r.title, description: r.description, category: r.category, conditions: r.conditions.map(({ type, target, habitId }) => ({ type, target, habitId })), claimCost: r.claimCost, savingsTarget: r.savingsTarget, savedAmount: r.savedAmount, savingsPerQuest: r.savingsPerQuest }); setOpen(true); }} className="grid h-9 w-9 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-mute2)] hover:text-[color:var(--pq-gold)]"><Pencil size={14}/></button>
        <button data-testid={`button-delete-reward-${r.id}`} aria-label={`Delete ${r.title}`} disabled={busy} onClick={() => { if (window.confirm(`Remove "${r.title}"?`)) void run({ action: 'deleteReward', id: r.id }); }} className="grid h-9 w-9 place-items-center border border-[color:var(--pq-line)] text-[color:var(--pq-mute)] hover:text-[color:var(--pq-danger)]"><Trash2 size={14}/></button></>}</div></article>
    {open && edit && <Editor initial={edit} onClose={() => setOpen(false)}/>}</>;
}

const rewardPresets = [
  { id: 'coffee', label: '☕ قهوة من الكافيه المفضل', title: 'قهوة من الكافيه المفضل', category: 'Treats', level: 2, cost: 50 },
  { id: 'meal', label: '🍕 وجبة مفتوحة في الويكند', title: 'وجبة مفتوحة في الويكند', category: 'Food', level: 3, cost: 120 },
  { id: 'gaming', label: '🎮 ساعتان ألعاب بدون ذنب', title: 'ساعتان ألعاب بدون ذنب', category: 'Fun', level: 2, cost: 80 },
  { id: 'cinema', label: '🎬 تذكرة سينما / فيلم جديد', title: 'تذكرة سينما / فيلم جديد', category: 'Entertainment', level: 4, cost: 200 },
] as const;

/** Sets the level gate without discarding other AND conditions. */
function withLevel(conditions: RpgCondition[], level: number): RpgCondition[] {
  const i = conditions.findIndex((c) => c.type === 'level');
  if (i >= 0) return conditions.map((c, j) => (j === i ? { ...c, target: level } : c));
  if (conditions.length < 3) return [{ type: 'level', target: level }, ...conditions];
  return conditions;
}

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { snap, run, isPending } = useRpg();
  const assistant = useRewardAssistant();
  const [d, setD] = useState<Draft>(initial); const [err, setErr] = useState('');
  const [aiPrompt, setAiPrompt] = useState(''); const [aiError, setAiError] = useState('');
  const [savingsOpen, setSavingsOpen] = useState(false);
  const session = useRef(0); const latest = useRef(d); latest.current = d;
  useEffect(() => () => { session.current += 1; }, []);
  const habits = (snap?.habits ?? []).filter((h) => !h.archived);
  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setC = (i: number, p: Partial<RpgCondition>) => upd('conditions', d.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const close = () => { session.current += 1; onClose(); };
  const applyPreset = (p: (typeof rewardPresets)[number]) => { session.current += 1; setAiError(''); setD((x) => ({ ...x, title: p.title, category: p.category, claimCost: p.cost, conditions: withLevel(x.conditions, p.level) })); };
  const requestAi = async () => {
    const prompt = aiPrompt.trim(); if (!prompt) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setAiError('Auto-Fill needs an internet connection. You can still fill the form manually.'); return; }
    setAiError(''); const id = ++session.current; const before = JSON.stringify(latest.current);
    try {
      const r = await assistant.mutateAsync({ data: { prompt } });
      if (id !== session.current) return;
      if (JSON.stringify(latest.current) !== before) { setAiError('You edited the form while Auto-Fill was running, so your changes were kept.'); return; }
      setD((x) => ({ ...x, title: r.title, description: r.description || x.description, category: r.category, claimCost: r.claimCost, conditions: withLevel(x.conditions, r.requiredLevel) }));
    } catch (e) { if (id === session.current) setAiError(e instanceof Error ? e.message : 'Auto-Fill failed. Try again.'); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (d.conditions.some((c) => c.type === 'streak' && !c.habitId)) { setErr('Choose a habit for each streak condition.'); return; }
    const conditions = d.conditions.map((c) => ({ type: c.type, target: Math.max(1, Number(c.target) || 1), ...(c.type === 'streak' ? { habitId: Number(c.habitId) } : {}) }));
    session.current += 1;
    const r = await run({ action: 'saveReward', id: d.id, title: d.title.trim(), description: d.description.trim(), category: d.category.trim() || 'Personal', conditions, claimCost: Math.max(0, Number(d.claimCost) || 0), savingsTarget: Math.max(0, Number(d.savingsTarget) || 0), savedAmount: Math.max(0, Number(d.savedAmount) || 0), savingsPerQuest: Math.max(0, Number(d.savingsPerQuest) || 0) }, { key: 'saveReward:editor' });
    if (r) onClose();
  };
  const hasSavings = d.savingsTarget > 0 || d.savedAmount > 0 || d.savingsPerQuest > 0;
  return <Modal title={d.id ? 'Edit reward' : 'Add a reward'} onClose={close} wide contentClassName="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden"><form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-6 pr-1">
    <div className="space-y-3 border border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)] p-3">
      <Field label="Auto-Fill ✨"><div className="flex flex-col gap-2 sm:flex-row"><input dir="auto" maxLength={500} data-testid="input-reward-ai-prompt" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void requestAi(); } }} placeholder="🔍 اكتب مكافأتك الواقعية.. مثلاً: شراء ساعة ذكية أو سهرة عشاء" className="field min-w-0 flex-1"/><Btn testId="button-reward-ai-fill" variant="cyan" className="shrink-0" disabled={!aiPrompt.trim() || assistant.isPending} onClick={() => void requestAi()}>{assistant.isPending ? 'جاري التحليل...' : 'Auto-Fill ✨'}</Btn></div></Field>
      <p className="text-[11px] text-[color:var(--pq-mute)]">Suggests a level gate and Gold cost. Nothing saves until you press Save.</p>
      {aiError && <p role="alert" data-testid="status-reward-ai-error" className="text-xs text-[color:var(--pq-danger)]">{aiError}</p>}
    </div>
    <div className="space-y-3 border border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)] p-3">
      <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-mute)]">قوالب سريعة</p>
      <div className="flex flex-wrap gap-2">{rewardPresets.map((p) => <button type="button" key={p.id} data-testid={`reward-template-${p.id}`} onClick={() => applyPreset(p)} className="border border-[color:var(--pq-line)] px-3 py-2 text-left text-xs font-bold text-[color:var(--pq-ink)] hover:border-[color:var(--pq-gold)] hover:text-[color:var(--pq-gold)]">{p.label}<span className="block font-mono text-[9px] font-normal text-[color:var(--pq-mute)]">Level {p.level} | {p.cost} Gold</span></button>)}</div>
    </div>
    <Field label="Reward name"><input autoFocus required maxLength={120} data-testid="input-reward-title" value={d.title} onChange={(e) => upd('title', e.target.value)} className="field"/></Field>
    <Field label="Gold cost" hint="Paid when you claim, separate from unlock conditions. 0 for free."><input type="number" min={0} max={1000000} data-testid="input-reward-claim-cost" value={d.claimCost} onChange={(e) => upd('claimCost', Number(e.target.value))} className="field"/></Field>
    <fieldset className="space-y-2"><legend className="mb-1 text-xs font-bold text-[color:var(--pq-ink2)]">Unlock conditions (all must be met)</legend>
      {d.conditions.map((c, i) => <div key={i} className="flex flex-wrap items-center gap-2 border border-[color:var(--pq-line2)] p-2">
        <select aria-label="Condition type" data-testid={`select-condition-type-${i}`} value={c.type} onChange={(e) => setC(i, { type: e.target.value as RpgConditionType, habitId: null })} className="field !w-auto"><option value="level">Player level</option><option value="streak">Habit streak</option><option value="gold">Gold balance</option></select>
        <input type="number" min={1} max={1000000} aria-label="Target" data-testid={`input-condition-target-${i}`} value={c.target} onChange={(e) => setC(i, { target: Number(e.target.value) })} className="field !w-24"/>
        {c.type === 'streak' && <select aria-label="Habit" data-testid={`select-condition-habit-${i}`} value={c.habitId ?? ''} onChange={(e) => setC(i, { habitId: e.target.value ? Number(e.target.value) : null })} className="field !w-auto min-w-0 flex-1"><option value="">Choose habit</option>{habits.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select>}
        {d.conditions.length > 1 && <button type="button" data-testid={`button-remove-condition-${i}`} onClick={() => upd('conditions', d.conditions.filter((_, j) => j !== i))} className="ml-auto text-xs text-[color:var(--pq-danger)]">Remove</button>}</div>)}
      {d.conditions.length < 3 && <Btn testId="button-add-condition" variant="quiet" className="!py-1.5 text-xs" onClick={() => upd('conditions', [...d.conditions, { type: 'gold', target: 50 }])}><Plus size={13}/> Add condition</Btn>}</fieldset>
    <Field label="Detail"><textarea maxLength={300} rows={2} data-testid="input-reward-description" value={d.description} onChange={(e) => upd('description', e.target.value)} className="field"/></Field>
    <Field label="Category"><input required maxLength={40} data-testid="input-reward-category" value={d.category} onChange={(e) => upd('category', e.target.value)} className="field"/></Field>
    <div className="border border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)]">
      <button type="button" data-testid="button-toggle-savings" aria-expanded={savingsOpen} aria-controls="reward-savings-panel" onClick={() => setSavingsOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-3 text-left text-xs font-bold text-[color:var(--pq-ink)]"><span>Track Real-World Savings (ربط بالادخار المالي) 💰{hasSavings && !savingsOpen && <span className="ml-2 font-mono text-[9px] text-[color:var(--pq-purple)]">{d.savedAmount}/{d.savingsTarget}</span>}</span><ChevronDown size={15} className={cx('shrink-0 transition-transform', savingsOpen && 'rotate-180')}/></button>
      <div id="reward-savings-panel" hidden={!savingsOpen} className="space-y-3 border-t border-[color:var(--pq-line)] p-3">
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Savings target"><input type="number" min={0} data-testid="input-reward-savings-target" value={d.savingsTarget} onChange={(e) => upd('savingsTarget', Number(e.target.value))} className="field"/></Field>
          <Field label="Saved so far"><input type="number" min={0} data-testid="input-reward-saved" value={d.savedAmount} onChange={(e) => upd('savedAmount', Number(e.target.value))} className="field"/></Field>
          <Field label="Per quest"><input type="number" min={0} data-testid="input-reward-per-quest" value={d.savingsPerQuest} onChange={(e) => upd('savingsPerQuest', Number(e.target.value))} className="field"/></Field></div>
        <p className="text-[11px] text-[color:var(--pq-mute)]">Savings are a manual, virtual estimate, not money or a payment.</p></div>
    </div>
    {err && <p role="alert" className="text-xs text-[color:var(--pq-danger)]">{err}</p>}
    </div>
    <div className="-mx-5 -mb-5 mt-3 flex shrink-0 justify-end gap-2 border-t border-[color:var(--pq-line)] bg-[color:var(--pq-panel)] p-5 pb-24 md:-mx-7 md:-mb-7 md:pb-5"><Btn testId="button-cancel-reward" variant="quiet" onClick={close}>Cancel / إلغاء</Btn><Btn testId="button-save-reward" type="submit" disabled={isPending('saveReward:editor')}>{isPending('saveReward:editor') ? 'Saving...' : 'Save / حفظ'}</Btn></div></form></Modal>;
}

export default function RewardsPage() {
  const [creating, setCreating] = useState(false);
  return <Gate>{(s) => {
    const active = s.rewards.filter((r) => r.status !== 'claimed');
    const claimed = s.rewards.filter((r) => r.status === 'claimed').sort((a, b) => new Date(b.claimedAt ?? b.createdAt).getTime() - new Date(a.claimedAt ?? a.createdAt).getTime());
    return <>
      <PageHead eyebrow="Real-life rewards" title="Reward shop" sub="Stack up to three conditions, add an optional Gold claim cost, then collect." action={<div className="flex items-center gap-3"><span data-testid="text-reward-gold-balance" className="flex items-center gap-2 border-2 border-[color:var(--pq-mute)] px-3 py-2 font-mono text-xs text-[color:var(--pq-gold)]"><CircleDollarSign size={16}/>{s.profile.gold} G</span><Btn testId="button-add-reward" onClick={() => setCreating(true)}><Plus size={16}/> Add reward</Btn></div>}/>
      {active.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map((r) => <Card key={r.id} r={r} gold={s.profile.gold}/>)}</div>
        : <Empty title="YOUR CHEST IS EMPTY" detail="Add a reward you genuinely look forward to." action={<Btn testId="button-empty-add-reward" onClick={() => setCreating(true)}><Plus size={14}/> Create your first reward</Btn>}/>}
      <Panel><SectionHead eyebrow="Earned and remembered" title="Trophy case" action={<span className="font-mono text-[9px] text-[color:var(--pq-mute)]">{claimed.length} claimed</span>}/>
        {claimed.length ? <div className="grid gap-3 sm:grid-cols-2">{claimed.map((r) => <Card key={r.id} r={r} gold={s.profile.gold}/>)}</div> : <div data-testid="empty-reward-archive"><Empty title="NO TROPHIES YET" detail="Claimed rewards are kept here."/></div>}</Panel>
      {creating && <Editor initial={blank} onClose={() => setCreating(false)}/>}
    </>;
  }}</Gate>;
}
