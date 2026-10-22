import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleDollarSign, Flame, LockKeyhole, Pencil, Shield, Swords, Trophy, X } from 'lucide-react';
import type { AvatarId } from '@workspace/api-client-react';
import { getGetPixelQuestDashboardQueryKey, getGetPixelQuestProfileQueryKey, useGetPixelQuestProfile, useUpdatePixelQuestProfile } from '@workspace/api-client-react';
import { Form } from '@/components/ui/form';
import { PixelAvatar } from '@/components/pixel-avatar';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
const box = 'pixel-border bg-[#211f33]/95 p-5 md:p-6';

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data: p, isLoading, isError, refetch } = useGetPixelQuestProfile();
  const update = useUpdatePixelQuestProfile();
  const [editingName, setEditingName] = useState(false);
  const [picker, setPicker] = useState(false);
  const [serverError, setServerError] = useState('');
  const form = useForm<{ username: string }>({ defaultValues: { username: '' } });
  const done = () => { void qc.invalidateQueries({ queryKey: getGetPixelQuestProfileQueryKey() }); void qc.invalidateQueries({ queryKey: getGetPixelQuestDashboardQueryKey() }); };
  const fail = (e: unknown) => setServerError((e as { data?: { error?: string; message?: string } })?.data?.error || (e as { data?: { message?: string } })?.data?.message || 'That change could not be saved.');
  if (isLoading) return <div className="space-y-4" aria-label="Loading profile"><div className="h-48 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/><div className="h-40 animate-pulse border-2 border-[#39354e] bg-[#211f33]"/></div>;
  if (isError || !p) return <section className={cx(box, 'text-center')}><Shield className="mx-auto mb-3 text-[#f5ca62]"/><p className="mb-4 text-sm text-[#b9b3c8]">Your hero sheet could not load.</p><button data-testid="button-retry-profile" onClick={() => void refetch()} className="pixel-button border-2 border-black/20 bg-[#f5ca62] px-4 py-2.5 text-sm font-bold text-[#252138]">Try again</button></section>;
  const current = p.avatars.find(a => a.id === p.avatarId);
  const submit = form.handleSubmit(v => { setServerError(''); update.mutate({ data: { username: v.username.trim() } }, { onSuccess: () => { done(); setEditingName(false); }, onError: fail }); });
  const stats = [{ k: 'Level', v: p.level, i: Shield }, { k: 'Lifetime XP', v: p.xp, i: Swords }, { k: 'Gold', v: p.gold, i: CircleDollarSign }, { k: 'Quests vanquished', v: p.lifetimeTasksVanquished, i: Trophy }, { k: 'Best streak', v: `${p.highestHabitStreak}d`, i: Flame }];
  return <div className="space-y-6">
    <div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[#73e6df]">Hero sheet</p><h1 className="pixel-title text-[15px] text-[#f3e9cf] md:text-[19px]">Your profile</h1></div>
    <section className={cx(box, 'flex flex-col gap-6 sm:flex-row sm:items-center')}>
      <button data-testid="button-open-avatar-picker" onClick={() => setPicker(true)} aria-label="Change avatar" className="relative w-fit border-2 border-[#f5ca62] shadow-[4px_4px_0_#0e0d18]"><PixelAvatar id={p.avatarId} size={120} testId="img-current-avatar"/><span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center bg-[#f5ca62] text-[#252138]"><Pencil size={12}/></span></button>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-wider text-[#a9a1b8]">{current?.name} · {current?.role}</p>
        {editingName ? <Form {...form}><form onSubmit={submit} className="mt-3 max-w-sm"><input autoFocus data-testid="input-username" className="field" {...form.register('username', { required: 'Username is required.', pattern: { value: /^[A-Za-z0-9_]{3,20}$/, message: 'Use 3-20 letters, numbers or underscores.' } })}/>
          {form.formState.errors.username && <p data-testid="error-username" className="mt-1 text-xs text-[#f29b83]">{form.formState.errors.username.message}</p>}
          {serverError && <p data-testid="error-profile-server" role="alert" className="mt-1 text-xs text-[#f29b83]">{serverError}</p>}
          <div className="mt-3 flex gap-2"><button data-testid="button-save-username" disabled={update.isPending} className="pixel-button border-2 border-black/20 bg-[#f5ca62] px-4 py-2 text-xs font-bold text-[#252138] disabled:opacity-40">{update.isPending ? 'Saving...' : 'Save'}</button><button type="button" data-testid="button-cancel-username" onClick={() => { setEditingName(false); setServerError(''); }} className="border border-[#514967] px-4 py-2 text-xs font-bold text-[#b9b3c8]">Cancel</button></div></form></Form>
        : <div className="mt-2 flex items-center gap-3"><h2 data-testid="text-username" className="pixel-title text-[13px] text-[#f4e7c5]">{p.username}</h2><button data-testid="button-edit-username" onClick={() => { form.reset({ username: p.username }); setServerError(''); setEditingName(true); }} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb] hover:text-[#f5ca62]" aria-label="Edit username"><Pencil size={14}/></button></div>}
        <p className="mt-3 max-w-md text-xs text-[#928ba4]">{current?.description}</p>
      </div></section>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{stats.map(({ k, v, i: Icon }) => <div key={k} data-testid={`stat-${k.toLowerCase().replaceAll(' ', '-')}`} className="border border-[#49445d] bg-[#1c1a2b] p-4"><Icon size={16} className="mb-2 text-[#73e6df]"/><p className="font-mono text-sm text-[#f5ca62]">{v}</p><p className="mt-2 text-[11px] text-[#928ba4]">{k}</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={box}><h2 className="pixel-title mb-5 text-[11px] text-[#f3e9cf]">Habit streaks</h2>
        {p.habitStreaks.length ? p.habitStreaks.map(h => <div key={h.habitId} data-testid={`streak-${h.habitId}`} className="flex items-center gap-3 border-b border-[#39354e] py-3 last:border-0"><Flame size={16} className="text-[#f5a55a]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.habitTitle}</span><span className="text-[11px] text-[#928ba4]">now {h.currentStreak}d</span><span className="font-mono text-[10px] text-[#f5ca62]">best {h.highestStreak}d</span></div>) : <p data-testid="empty-streaks" className="text-sm text-[#928ba4]">No habit streaks yet. Complete a habit to start one.</p>}</section>
      <section className={box}><h2 className="pixel-title mb-5 text-[11px] text-[#f3e9cf]">Milestones</h2>
        {p.milestones.length ? <ol className="border-l-2 border-[#514967] pl-5">{p.milestones.map(m => <li key={m.id} data-testid={`milestone-${m.id}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[27px] top-1 h-3 w-3 border-2 border-[#f5ca62] bg-[#211f33]"/><p className="text-sm font-bold">{m.title}</p><p className="mt-1 text-xs text-[#928ba4]">{m.description}</p><p className="mt-1 font-mono text-[8px] text-[#73e6df]">{m.achievedAt ? new Date(m.achievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'}</p></li>)}</ol> : <p data-testid="empty-milestones" className="text-sm text-[#928ba4]">Milestones will appear as you play.</p>}</section>
    </div>
    {picker && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d0c16]/80 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setPicker(false); }}><div role="dialog" aria-modal="true" className="pixel-border my-auto w-full max-w-2xl bg-[#211f33] p-5 md:p-7">
      <div className="mb-5 flex items-start justify-between"><h2 className="pixel-title text-[11px] text-[#f3e9cf]">Choose avatar</h2><button data-testid="button-close-avatar-picker" aria-label="Close" onClick={() => setPicker(false)} className="grid h-8 w-8 place-items-center border border-[#514967] text-[#aaa4bb]"><X size={16}/></button></div>
      {serverError && <p role="alert" className="mb-3 text-xs text-[#f29b83]">{serverError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{p.avatars.map(a => { const sel = a.id === p.avatarId; return <button key={a.id} data-testid={`button-avatar-${a.id}`} disabled={!a.unlocked || update.isPending} aria-pressed={sel} onClick={() => { setServerError(''); update.mutate({ data: { avatarId: a.id as AvatarId } }, { onSuccess: () => { done(); setPicker(false); }, onError: fail }); }} className={cx('flex gap-3 border-2 p-3 text-left', sel ? 'border-[#f5ca62] bg-[#363043]' : a.unlocked ? 'border-[#49445d] bg-[#1c1a2b] hover:border-[#73e6df]' : 'border-[#39354e] bg-[#181726] opacity-70 cursor-not-allowed')}>
        <PixelAvatar id={a.id as AvatarId} size={64} locked={!a.unlocked}/><span className="min-w-0"><b className="block text-sm">{a.name}</b><span className="block text-[10px] text-[#73e6df]">{a.role}</span><span className="mt-1 block text-[11px] text-[#928ba4]">{a.description}</span><span className="mt-2 flex items-center gap-1 font-mono text-[8px] text-[#f5ca62]">{sel ? <><Check size={11}/> EQUIPPED</> : a.unlocked ? 'SELECT' : <><LockKeyhole size={11}/> LEVEL {a.requiredLevel}</>}</span></span></button>; })}</div>
    </div></div>}
  </div>;
}
