import { useState } from 'react';
import { Check, CircleDollarSign, Flame, LockKeyhole, Pencil, Shield, Swords, Trophy } from 'lucide-react';
import { PixelAvatar } from '@/components/pixel-avatar';
import { Gate, Modal, PageHead, Panel, SectionHead, cx } from '@/components/kit';
import { useRpg } from '@/lib/rpg-context';
import { themedLabel } from '@/lib/avatar-art';
import { useTheme } from '@/lib/theme';

export default function ProfilePage() {
  const { run, isPending, clearError } = useRpg(); const { theme } = useTheme();
  const [picker, setPicker] = useState(false);
  return <Gate>{(s) => {
    const p = s.profile; const current0 = p.avatars.find((a) => a.id === p.avatarId); const lab = (a: { id: typeof p.avatarId; name: string; role: string }) => themedLabel(theme, a.id, a); const current = current0 && { ...current0, ...lab(current0) };
    const stats = [{ k: 'Level', v: p.level, i: Shield }, { k: 'Lifetime XP', v: p.xp, i: Swords }, { k: 'Gold', v: p.gold, i: CircleDollarSign }, { k: 'Quests vanquished', v: p.lifetimeTasksVanquished, i: Trophy }, { k: 'Best streak', v: `${p.highestHabitStreak}d`, i: Flame }];
    return <>
      <PageHead eyebrow="Hero sheet" title="Your profile"/>
      <section className="pixel-border flex flex-col gap-6 bg-[color:var(--pq-panel)]/95 p-5 sm:flex-row sm:items-center md:p-6">
        <button data-testid="button-open-avatar-picker" onClick={() => { clearError(); setPicker(true); }} aria-label="Change avatar" className="relative w-fit border-2 border-[color:var(--pq-gold)] shadow-[4px_4px_0_var(--pq-shadow)]"><PixelAvatar id={p.avatarId} size={120} testId="img-current-avatar"/><span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]"><Pencil size={12}/></span></button>
        <div className="min-w-0 flex-1"><p className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--pq-mute)]">{current?.name} · {current?.role}</p>
          <h2 data-testid="text-username" className="pixel-title mt-2 text-[13px] text-[color:var(--pq-gold)]">{p.username}</h2>
          <p className="mt-3 max-w-md text-xs text-[color:var(--pq-mute)]">{current?.description}</p></div></section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{stats.map(({ k, v, i: Icon }) => <div key={k} data-testid={`stat-${k.toLowerCase().replaceAll(' ', '-')}`} className="border border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] p-4"><Icon size={16} className="mb-2 text-[color:var(--pq-cyan)]"/><p className="font-mono text-sm text-[color:var(--pq-gold)]">{v}</p><p className="mt-2 text-[11px] text-[color:var(--pq-mute)]">{k}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel><SectionHead title="Habit streaks"/>{p.habitStreaks.length ? p.habitStreaks.map((h) => <div key={h.habitId} data-testid={`streak-${h.habitId}`} className="flex items-center gap-3 border-b border-[color:var(--pq-line3)] py-3 last:border-0"><Flame size={16} className="text-[color:var(--pq-mute)]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.habitTitle}</span><span className="text-[11px] text-[color:var(--pq-mute)]">now {h.currentStreak}d</span><span className="font-mono text-[10px] text-[color:var(--pq-gold)]">best {h.highestStreak}d</span></div>) : <p data-testid="empty-streaks" className="text-sm text-[color:var(--pq-mute)]">No habit streaks yet. Complete a habit to start one.</p>}</Panel>
        <Panel><SectionHead title="Milestones"/>{p.milestones.length ? <ol className="border-l-2 border-[color:var(--pq-line)] pl-5">{p.milestones.map((m) => <li key={m.id} data-testid={`milestone-${m.id}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[27px] top-1 h-3 w-3 border-2 border-[color:var(--pq-gold)] bg-[color:var(--pq-panel)]"/><p className="text-sm font-bold">{m.title}</p><p className="mt-1 text-xs text-[color:var(--pq-mute)]">{m.description}</p><p className="mt-1 font-mono text-[8px] text-[color:var(--pq-cyan)]">{new Date(m.achievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p></li>)}</ol> : <p data-testid="empty-milestones" className="text-sm text-[color:var(--pq-mute)]">Milestones will appear as you play.</p>}</Panel></div>
      <Panel><SectionHead eyebrow="HELP" title="How the rules work"/><ul data-testid="list-rules" className="space-y-2.5 text-sm text-[color:var(--pq-ink2)]">{s.rules.map((r, i) => <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[color:var(--pq-cyan)]"/>{r}</li>)}</ul></Panel>
      {picker && <Modal title="Choose avatar" onClose={() => setPicker(false)} wide><div className="grid gap-3 sm:grid-cols-2">{p.avatars.map((a) => { const sel = a.id === p.avatarId; return <button key={a.id} data-testid={`button-avatar-${a.id}`} disabled={!a.unlocked || isPending('profile:')} aria-pressed={sel} onClick={() => void run({ action: 'profile', avatarId: a.id }).then((r) => { if (r) setPicker(false); })} className={cx('flex gap-3 border-2 p-3 text-left', sel ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-line2)]' : a.unlocked ? 'border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] hover:border-[color:var(--pq-cyan)]' : 'cursor-not-allowed border-[color:var(--pq-line3)] bg-[color:var(--pq-panel2)] opacity-70')}>
        <PixelAvatar id={a.id} size={64} locked={!a.unlocked}/><span className="min-w-0"><b className="block text-sm">{lab(a).name}</b><span className="block text-[10px] text-[color:var(--pq-cyan)]">{lab(a).role}</span><span className="mt-1 block text-[11px] text-[color:var(--pq-mute)]">{a.description}</span><span className="mt-2 flex items-center gap-1 font-mono text-[8px] text-[color:var(--pq-gold)]">{sel ? <><Check size={11}/> EQUIPPED</> : a.unlocked ? 'SELECT' : <><LockKeyhole size={11}/> LEVEL {a.requiredLevel}</>}</span></span></button>; })}</div></Modal>}
    </>;
  }}</Gate>;
}
