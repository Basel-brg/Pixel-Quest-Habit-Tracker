import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, BadgeCheck, CircleDollarSign, Clock3, Gift, LockKeyhole, Plus, Sparkles, Trophy, X } from 'lucide-react';
import type { Habit, Reward, RewardInput, RewardUpdate } from '@workspace/api-client-react';
import {
  getGetHabitsQueryKey, getGetPixelQuestDashboardQueryKey, getGetRewardsQueryKey,
  useClaimReward, useCreateReward, useDeleteReward, useGetHabits, useGetPixelQuestDashboard,
  useGetRewards, useUpdateReward,
} from '@workspace/api-client-react';

type FormValues = RewardInput;
const emptyForm: FormValues = { title: '', description: '', category: 'Personal', ruleType: 'gold', target: 100, habitId: null };
const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');
const invalidateRewards = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: getGetRewardsQueryKey() });
  void qc.invalidateQueries({ queryKey: getGetPixelQuestDashboardQueryKey() });
  void qc.invalidateQueries({ queryKey: getGetHabitsQueryKey() });
};
function chime() {
  if (localStorage.getItem('pixelquest-muted') === 'true') return;
  try {
    const context = new window.AudioContext();
    [523, 659, 784, 1047].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.028, context.currentTime + index * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.075 + 0.16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.075);
      oscillator.stop(context.currentTime + index * 0.075 + 0.17);
    });
    window.setTimeout(() => void context.close(), 600);
  } catch { /* Audio is optional. */ }
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={cx('pixel-border bg-[#211f33]/95 p-5 md:p-6', className)}>{children}</section>;
}
function RewardEditor({ reward, habits, busy, onClose, onSave }: {
  reward: Reward | null; habits: Habit[]; busy: boolean; onClose: () => void; onSave: (data: RewardInput) => void;
}) {
  const form = useForm<FormValues>({ defaultValues: reward ? {
    title: reward.title, description: reward.description, category: reward.category, ruleType: reward.ruleType,
    target: reward.target, habitId: reward.habitId,
  } : emptyForm });
  const ruleType = form.watch('ruleType');
  const submit = form.handleSubmit((values) => {
    if (values.ruleType === 'streak' && !values.habitId) {
      form.setError('habitId', { type: 'validate', message: 'Choose an active habit for this streak.' });
      return;
    }
    onSave({ ...values, title: values.title.trim(), description: values.description.trim(), category: values.category.trim(),
      target: Number(values.target), habitId: values.ruleType === 'streak' ? Number(values.habitId) : null });
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d0c16]/80 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" className="pixel-border my-auto w-full max-w-xl bg-[#211f33] p-5 md:p-7">
      <div className="mb-5 flex items-start justify-between"><div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#73e6df]">REWARD BLUEPRINT</p><h2 className="pixel-title text-[11px] text-[#f3e9cf]">{reward ? 'Edit reward' : 'Add a reward'}</h2></div><button data-testid="button-close-reward-editor" aria-label="Close editor" onClick={onClose} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f5ca62]"><X size={16}/></button></div>
      <Form {...form}><form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">Reward name</span><input autoFocus maxLength={120} data-testid="input-reward-title" className="field" placeholder="A slow Sunday morning" {...form.register('title', { required: 'Give your reward a name.', maxLength: 120 })}/>{form.formState.errors.title&&<span className="mt-1 block text-xs text-[#f29b83]">{form.formState.errors.title.message}</span>}</label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">A little detail</span><textarea maxLength={300} rows={2} data-testid="input-reward-description" className="field resize-y" placeholder="What makes this worth working toward?" {...form.register('description', { maxLength: 300 })}/></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">Category</span><input maxLength={40} data-testid="input-reward-category" className="field" placeholder="Experiences, treats, time..." {...form.register('category', { required: 'Add a category.', maxLength: 40 })}/>{form.formState.errors.category&&<span className="mt-1 block text-xs text-[#f29b83]">{form.formState.errors.category.message}</span>}</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">Unlock rule</span><select data-testid="select-reward-rule" className="field" {...form.register('ruleType', { onChange: () => { form.clearErrors('habitId'); } })}><option value="gold">Gold balance</option><option value="streak">Habit streak</option><option value="level">Player level</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">{ruleType === 'gold' ? 'Gold needed' : ruleType === 'level' ? 'Level needed' : 'Consecutive days'}</span><input type="number" min={1} max={1000000} step={1} data-testid="input-reward-target" className="field" {...form.register('target', { valueAsNumber: true, required: 'Set a target.', min: { value: 1, message: 'Target must be at least 1.' }, max: { value: 1000000, message: 'Target is too high.' } })}/>{form.formState.errors.target&&<span className="mt-1 block text-xs text-[#f29b83]">{form.formState.errors.target.message}</span>}</label>
        </div>
        {ruleType === 'streak' && <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#b9b3c8]">Habit to build on</span><select data-testid="select-reward-habit" className="field" {...form.register('habitId', { setValueAs: v => v ? Number(v) : null })}><option value="">Choose an active habit</option>{habits.map(habit => <option key={habit.id} value={habit.id}>{habit.title}</option>)}</select>{form.formState.errors.habitId&&<span className="mt-1 block text-xs text-[#f29b83]">{form.formState.errors.habitId.message}</span>}{!habits.length&&<span className="mt-1 block text-xs text-[#f5ca62]">Create an active habit first to use a streak rule.</span>}</label>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" data-testid="button-cancel-reward" onClick={onClose} className="border border-[#514967] px-4 py-2.5 text-sm font-bold text-[#b9b3c8] hover:bg-[#2a273b]">Cancel</button><button data-testid="button-save-reward" disabled={busy} className="pixel-button border-2 border-black/20 bg-[#f5ca62] px-4 py-2.5 text-sm font-bold text-[#252138] disabled:opacity-40">{busy ? 'Saving...' : reward ? 'Save changes' : 'Add reward'}</button></div>
      </form></Form>
    </div>
  </div>;
}
function RewardCard({ reward, gold, onEdit, onDelete, onClaim, busy }: {
  reward: Reward; gold: number; onEdit: () => void; onDelete: () => void; onClaim: () => void; busy: boolean;
}) {
  const progress = Math.max(0, Math.min(100, reward.target ? reward.currentValue / reward.target * 100 : 0));
  const isClaimed = reward.status === 'claimed';
  const ruleLabel = reward.ruleType === 'gold' ? `${reward.target} Gold` : reward.ruleType === 'level' ? `Level ${reward.target}` : `${reward.target}-day streak`;
  const remaining = reward.ruleType === 'gold' ? Math.max(0, reward.target - gold) : Math.max(0, reward.target - reward.currentValue);
  return <article data-testid={`card-reward-${reward.id}`} className={cx('quest-card relative flex min-h-[252px] flex-col border-2 p-5', isClaimed ? 'border-[#685d72] bg-[#201e2c]' : reward.status === 'ready' ? 'border-[#8a7447] bg-[linear-gradient(135deg,#302a37,#252236)]' : 'border-[#49445d] bg-[#1c1a2b]')}>
    <div className="mb-4 flex items-start justify-between gap-3"><span className={cx('grid h-11 w-11 shrink-0 place-items-center border-2', isClaimed ? 'border-[#756b83] text-[#b9b1c8]' : reward.status === 'ready' ? 'border-[#f5ca62] bg-[#393343] text-[#f5ca62]' : 'border-[#514967] bg-[#262337] text-[#858096]')}>{isClaimed ? <Trophy size={19}/> : reward.status === 'ready' ? <Gift size={19}/> : <LockKeyhole size={18}/>}</span><span className={cx('border px-2 py-1 font-mono text-[8px] uppercase tracking-wider',isClaimed?'border-[#514967] text-[#aaa4bb]':reward.status==='ready'?'border-[#8a7447] text-[#f5ca62]':'border-[#49445d] text-[#918ba3]')}>{isClaimed ? 'CLAIMED' : reward.status === 'ready' ? 'READY TO CLAIM' : 'IN PROGRESS'}</span></div>
    <div className="min-w-0"><div className="mb-1 flex items-center gap-2"><span className="font-mono text-[8px] uppercase tracking-[.15em] text-[#73e6df]">{reward.category}</span>{reward.ruleType === 'gold' && <CircleDollarSign size={13} className="text-[#f5ca62]"/>}</div><h3 data-testid={`text-reward-title-${reward.id}`} className="text-base font-bold text-[#eee8da]">{reward.title}</h3>{reward.description&&<p className="mt-2 min-h-8 text-xs leading-relaxed text-[#928ba4]">{reward.description}</p>}</div>
    <div className="mt-auto pt-5">
      {isClaimed ? <div className="flex items-center gap-2 border-t border-[#39354e] pt-3 text-[11px] text-[#9b94a9]"><BadgeCheck size={14} className="text-[#73e6df]"/>Added to your trophy archive{reward.claimedAt&&<span className="ml-auto font-mono text-[9px]">{new Date(reward.claimedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>}</div> :
      <><div className="mb-2 flex items-center justify-between gap-3"><span data-testid={`text-reward-progress-${reward.id}`} className="text-[11px] text-[#b9b3c8]">{reward.progressText}</span><span className="shrink-0 font-mono text-[8px] text-[#89829b]">{ruleLabel}</span></div><div className="h-2 border border-[#514967] bg-[#171624] p-[1px]"><div className={cx('h-full transition-[width] duration-500',reward.status==='ready'?'bg-[#f5ca62]':'bg-[#73e6df]')} style={{width:`${reward.status==='ready'?100:progress}%`}}/></div>
      {reward.status === 'locked' && <p className="mt-2 font-mono text-[8px] text-[#858096]">{reward.ruleType==='gold' ? `${remaining} Gold to go` : `${remaining} ${reward.ruleType==='level'?'levels':'days'} to go`}{reward.ruleType==='streak'&&reward.habitTitle?` · ${reward.habitTitle}`:''}</p>}
      </>}
      <div className="mt-4 flex items-center gap-2">
        {reward.status==='ready'&&!isClaimed&&<button data-testid={`button-claim-reward-${reward.id}`} disabled={busy} onClick={onClaim} className="pixel-button inline-flex flex-1 items-center justify-center gap-2 border-2 border-black/20 bg-[#f5ca62] px-3 py-2.5 text-xs font-bold text-[#252138] disabled:opacity-40"><Gift size={14}/>{busy?'Claiming...':'Claim reward'}</button>}
        {!isClaimed&&<><button data-testid={`button-edit-reward-${reward.id}`} onClick={onEdit} className="border border-[#514967] px-3 py-2 text-[10px] font-bold text-[#aaa4bb] hover:text-[#f5ca62]">Edit</button><button data-testid={`button-delete-reward-${reward.id}`} onClick={onDelete} aria-label={`Delete ${reward.title}`} className="grid h-9 w-9 place-items-center border border-[#514967] text-[#8f89a2] hover:border-[#f29b83] hover:text-[#f29b83]"><X size={14}/></button></>}
      </div>
    </div>
  </article>;
}
export default function RewardsPage() {
  const qc = useQueryClient();
  const { data: rewards = [], isLoading, isError, refetch } = useGetRewards();
  const { data: habits = [] } = useGetHabits({ archived: false });
  const { data: dashboard } = useGetPixelQuestDashboard();
  const create = useCreateReward(); const update = useUpdateReward(); const remove = useDeleteReward(); const claim = useClaimReward();
  const [editing, setEditing] = useState<Reward | null | undefined>(undefined);
  const [celebration, setCelebration] = useState(false);
  const previous = useRef<Map<number, Reward['status']> | null>(null);
  useEffect(() => {
    if (isLoading || isError) return;
    const current = new Map(rewards.map(reward => [reward.id, reward.status]));
    if (previous.current) {
      const unlocked = rewards.some(reward => reward.status === 'ready' && previous.current?.get(reward.id) === 'locked');
      if (unlocked) {
        setCelebration(true);
        chime();
        const timer = window.setTimeout(() => setCelebration(false), 1500);
        previous.current = current;
        return () => window.clearTimeout(timer);
      }
    }
    previous.current = current;
  }, [rewards, isLoading, isError]);
  const closeEditor = () => setEditing(undefined);
  const save = (data: RewardInput) => {
    if (editing) {
      const updateData: RewardUpdate = data;
      update.mutate({ rewardId: editing.id, data: updateData }, { onSuccess: () => { invalidateRewards(qc); closeEditor(); }, onError: () => void qc.invalidateQueries({ queryKey: getGetRewardsQueryKey() }) });
    } else create.mutate({ data }, { onSuccess: () => { invalidateRewards(qc); closeEditor(); }, onError: () => void qc.invalidateQueries({ queryKey: getGetRewardsQueryKey() }) });
  };
  const active = rewards.filter(reward => reward.status !== 'claimed');
  const claimed = rewards.filter(reward => reward.status === 'claimed').sort((a,b) => new Date(b.claimedAt || b.createdAt).getTime() - new Date(a.claimedAt || a.createdAt).getTime());
  const gold = dashboard?.profile.gold ?? 0;
  if (isLoading) return <div className="space-y-4" aria-label="Loading rewards"><div className="h-36 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0,1,2].map(i=><div key={i} className="h-56 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/> )}</div></div>;
  if (isError) return <Panel className="py-12 text-center"><Archive className="mx-auto mb-3 text-[#f5ca62]"/><p className="mb-4 text-sm text-[#b9b3c8]">The reward chest could not sync just now.</p><button data-testid="button-retry-rewards" onClick={()=>void refetch()} className="pixel-button border-2 border-black/20 bg-[#f5ca62] px-4 py-2.5 text-sm font-bold text-[#252138]">Try again</button></Panel>;
  return <div className="space-y-6">
    <div className="relative overflow-hidden border-2 border-[#665b45] bg-[linear-gradient(112deg,#2b273a,#242137_58%,#343043)] p-5 shadow-[4px_4px_0_#0e0d18] md:p-7">
      <div className="absolute -right-6 -top-8 hidden rotate-12 border-[16px] border-[#f5ca62]/[.06] p-8 sm:block"><Gift size={80} className="text-[#f5ca62]/20"/></div>
      <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-3 font-mono text-[9px] uppercase tracking-[.2em] text-[#73e6df]">A little something to work toward</p><h1 className="pixel-title text-[15px] leading-loose text-[#f3e9cf] md:text-[19px]">Reward shop</h1><p className="mt-3 max-w-md text-sm leading-relaxed text-[#aaa4bb]">Make your next real-life treat part of the quest. One rule, steady progress, then it is yours.</p></div><div data-testid="text-reward-gold-balance" className="flex items-center gap-3 border-2 border-[#806b42] bg-[#211f33]/80 px-4 py-3"><CircleDollarSign size={21} className="text-[#f5ca62]"/><div><p className="font-mono text-[8px] uppercase tracking-wider text-[#a9a1b8]">Gold balance</p><p className="mt-1 font-mono text-sm text-[#f5ca62]">{gold.toLocaleString()} G</p></div></div></div>
    </div>
    {celebration&&<div data-testid="reward-unlock-celebration" aria-live="polite" className="pointer-events-none fixed inset-0 z-40 overflow-hidden"><div className="absolute left-1/2 top-[21%] -translate-x-1/2 border-2 border-[#f5ca62] bg-[#211f33] px-5 py-4 text-center shadow-[5px_5px_0_#0e0d18]"><Sparkles className="mx-auto mb-2 text-[#f5ca62]"/><p className="pixel-title text-[9px] text-[#f5ca62]">CHEST UNLOCKED</p><p className="mt-2 font-mono text-[8px] text-[#73e6df]">A NEW REWARD IS READY</p></div>{!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Array.from({length:30},(_,i)=><i key={i} className="pixel-spark absolute h-2 w-2" style={{left:`${(i*31)%98}%`,top:`${(i*17)%74}%`,background:['#f5ca62','#73e6df','#b497f7','#f29b83'][i%4],animationDelay:`${i*12}ms`}}/>)}</div>}
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#73e6df]">Your next real-world win</p><h2 className="pixel-title text-[11px] text-[#f3e9cf]">Open quests</h2></div><button data-testid="button-add-reward" onClick={()=>setEditing(null)} className="pixel-button inline-flex items-center gap-2 border-2 border-black/20 bg-[#f5ca62] px-4 py-2.5 text-sm font-bold text-[#252138]"><Plus size={16}/> Add reward</button></div>
    {active.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(reward=><RewardCard key={reward.id} reward={reward} gold={gold} busy={claim.isPending&&claim.variables?.rewardId===reward.id} onEdit={()=>setEditing(reward)} onDelete={()=>{if(window.confirm(`Remove "${reward.title}" from your reward shop?`))remove.mutate({rewardId:reward.id},{onSuccess:()=>invalidateRewards(qc)});}} onClaim={()=>claim.mutate({rewardId:reward.id},{onSuccess:()=>invalidateRewards(qc)})}/>)}</div> : <Panel className="py-10 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center border-2 border-[#786844] bg-[#302b3a] text-[#f5ca62]"><Gift size={21}/></div><h3 className="pixel-title text-[9px] text-[#e8dfcb]">YOUR CHEST IS EMPTY</h3><p className="mx-auto mt-3 max-w-sm text-sm text-[#928ba4]">Add a reward you genuinely look forward to. Your habits will help unlock it.</p><button data-testid="button-empty-add-reward" onClick={()=>setEditing(null)} className="mt-5 inline-flex items-center gap-2 border border-[#806b42] px-4 py-2.5 text-xs font-bold text-[#f5ca62] hover:bg-[#383244]"><Plus size={14}/> Create your first reward</button></Panel>}
    <Panel><div className="mb-5 flex items-end justify-between gap-3"><div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#73e6df]">Earned and remembered</p><h2 className="pixel-title text-[10px] text-[#f3e9cf]">Trophy archive</h2></div><span className="flex items-center gap-2 font-mono text-[8px] text-[#8f89a2]"><Clock3 size={13}/>{claimed.length} claimed</span></div>
      {claimed.length ? <div className="grid gap-3 sm:grid-cols-2">{claimed.map(reward=><RewardCard key={reward.id} reward={reward} gold={gold} busy={false} onEdit={()=>undefined} onDelete={()=>undefined} onClaim={()=>undefined}/>)}</div> : <div data-testid="empty-reward-archive" className="flex flex-col items-center border border-dashed border-[#514967] bg-[#1c1a2b] px-4 py-7 text-center"><Trophy size={20} className="mb-3 text-[#746b82]"/><p className="text-xs font-bold text-[#b9b3c8]">No rewards claimed yet</p><p className="mt-1 text-[11px] text-[#817b92]">Your claimed rewards will stay here as a record of your wins.</p></div>}
    </Panel>
    {editing !== undefined&&<RewardEditor reward={editing} habits={habits} busy={create.isPending||update.isPending} onClose={closeEditor} onSave={save}/>}
    {(create.isError||update.isError||remove.isError||claim.isError)&&<div role="alert" data-testid="status-reward-mutation-error" className="border border-[#854757] bg-[#3a2631] px-4 py-3 text-xs text-[#ffb8aa]">That reward action did not save. Your shop has been refreshed; please try again.</div>}
  </div>;
}
