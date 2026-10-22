import { Link } from 'wouter';
import { Check, Gift, Heart, Skull, Tent } from 'lucide-react';
import { Btn, Empty, Gate, Meter, PageHead, Panel, SectionHead, cx, fmtDate } from '@/components/kit';
import { HabitProgress } from '@/components/habit-progress';
import { SkillRadar } from '@/components/skill-radar';
import { useRpg } from '@/lib/rpg-context';

export default function CampPage() {
  const { run, isPending } = useRpg();
  return <Gate>{(s) => {
    const today = s.habits.filter((h) => !h.archived && h.scheduledToday);
    const quests = s.quests.filter((q) => q.status === 'active');
    const fainted = !!s.faintedUntil && new Date(s.faintedUntil) > new Date();
    const pct = (p: number) => (p <= 1 ? p * 100 : p);
    return <>
      <PageHead eyebrow={`${s.today} / ${s.timezone}`} title="Camp" sub="Today's habits, quests and the bosses waiting at the end of the week."/>
      <Panel className={cx(fainted && 'border-[#854757]')}>
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 font-mono text-[10px] uppercase text-[#f29b83]"><Heart size={14}/>Health</span><span data-testid="text-hp" className="font-mono text-xs text-[#f3e9cf]">{s.hp} / 100 HP</span></div>
            <Meter value={s.hp} max={100} color={s.hp < 30 ? '#f29b83' : '#73e6df'} label="Health points"/>
            {fainted && <p data-testid="status-fainted" className="mt-3 flex items-center gap-2 text-xs text-[#ffb8aa]"><Skull size={14}/>Fainted: XP is halved until {new Date(s.faintedUntil!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, then you recover 50 HP.</p>}
            {s.campingToday && <p data-testid="status-camping" className="mt-3 flex items-center gap-2 text-xs text-[#9cf4ed]"><Tent size={14}/>Camping today: active habits are frozen and protected, no XP earned.</p>}</div>
          <div className="flex gap-3 text-center"><div className="border border-[#49445d] bg-[#1c1a2b] px-4 py-2"><b className="block font-mono text-sm text-[#f5ca62]">{s.profile.level}</b><span className="text-[10px] text-[#928ba4]">Level</span></div><div className="border border-[#49445d] bg-[#1c1a2b] px-4 py-2"><b data-testid="text-gold" className="block font-mono text-sm text-[#f5ca62]">{s.profile.gold}</b><span className="text-[10px] text-[#928ba4]">Gold</span></div><div className="border border-[#49445d] bg-[#1c1a2b] px-4 py-2"><b className="block font-mono text-sm text-[#f5ca62]">{s.profile.xp}</b><span className="text-[10px] text-[#928ba4]">XP</span></div></div>
        </div>
        <div className="mt-4 border-t border-[#49445d] pt-4"><div className="mb-2 flex justify-between text-xs text-[#aaa4bb]"><span>Level {s.profile.level} experience</span><span>{s.profile.xp - (s.profile.level - 1) * s.profile.level * 50} / {s.profile.level * 100} XP</span></div><Meter value={s.profile.xp - (s.profile.level - 1) * s.profile.level * 50} max={s.profile.level * 100} color="#f5ca62" label="Experience toward next level"/></div></Panel>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Panel><SectionHead eyebrow="TODAY" title="Habits" action={<Link href="/habits" data-testid="link-all-habits" className="text-xs font-semibold text-[#73e6df] no-underline">Manage</Link>}/>
          {today.length ? today.map((h) => <div key={h.id} data-testid={`habit-row-${h.id}`} className="flex flex-col gap-3 border-b border-[#39354e] py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className={cx('truncate text-sm font-semibold', h.progress >= h.target && 'text-[#aaa4bb] line-through')}>{h.title}</p><p className="mt-1 text-[11px] text-[#89829b]">{h.stat} · {h.mandatory ? 'Mandatory' : 'Optional'} · streak {h.streak}</p></div><HabitProgress habit={h}/></div>)
            : <Empty title="NOTHING SCHEDULED" detail="No habits are scheduled today. Rest, or add a habit." action={<Link href="/habits" className="text-sm font-bold text-[#73e6df] no-underline">Open habits</Link>}/>}</Panel>
        <Panel><SectionHead eyebrow="CHARACTER" title="Skills"/><SkillRadar skills={s.skills}/></Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel><SectionHead eyebrow="SIDE QUESTS" title="Active quests" action={<Link href="/quests" data-testid="link-all-quests" className="text-xs font-semibold text-[#73e6df] no-underline">Quest board</Link>}/>
          {quests.length ? quests.slice(0, 6).map((q) => <div key={q.id} data-testid={`quest-row-${q.id}`} className="flex items-center gap-3 border-b border-[#39354e] py-3 last:border-0">
            <button data-testid={`button-complete-task-${q.id}`} disabled={isPending(`completeQuest:${q.id}`)} aria-label={`Complete ${q.title}`} onClick={() => void run({ action: 'completeQuest', id: q.id, completed: true }, { optimistic: (x) => ({ ...x, quests: x.quests.map((y) => (y.id === q.id ? { ...y, status: 'completed' } : y)) }) })} className="grid h-7 w-7 shrink-0 place-items-center border-2 border-[#625a72] text-[#625a72] hover:border-[#f5ca62] hover:text-[#f5ca62] disabled:opacity-40"><Check size={14}/></button>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{q.title}</p><p className="mt-1 text-[11px] text-[#89829b]">{q.difficulty} · {q.xpReward} XP / {q.goldReward} G{q.dueDate && ` · due ${fmtDate(q.dueDate)}`}</p></div></div>)
            : <Empty title="BOARD CLEAR" detail="No active quests right now."/>}</Panel>
        <Panel><SectionHead eyebrow="THIS WEEK" title="Bosses"/>
          {s.bosses.length ? <div className="space-y-4">{s.bosses.map((b) => <div key={b.id} data-testid={`boss-${b.id}`} className={cx('border p-3', b.defeated ? 'border-[#537872] bg-[#1f3236]' : 'border-[#49445d] bg-[#1c1a2b]')}>
            <div className="mb-2 flex items-center justify-between gap-3"><svg role="img" aria-label="Pixel boss" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges"><path fill={b.defeated ? '#537872' : '#b497f7'} d="M4 1h8v2h2v3h1v8h-3v-2h-2v3H6v-3H4v2H1V6h1V3h2z"/><path fill="#191827" d="M4 5h3v3H4zm5 0h3v3H9zM6 10h4v2H6z"/><path fill="#f29b83" d="M5 6h1v1H5zm5 0h1v1h-1z"/></svg><b className="flex-1 text-sm">{b.name}</b><span className="font-mono text-[10px] text-[#f29b83]">{b.defeated ? 'DEFEATED' : `${b.hp} / ${b.maxHp} HP`}</span></div>
            <Meter value={b.hp} max={b.maxHp} color="#f29b83" label={`${b.name} health`}/><p className="mt-2 text-[11px] text-[#928ba4]">{b.taskIds.length} quests bound. Each cleared quest hits for 25 HP. Bonus {b.bonusGold} G and {b.loot}.</p>
            {!b.defeated && <div className="mt-3 space-y-2">{s.quests.filter(q => b.taskIds.includes(q.id)).map(q => <div className="flex items-center justify-between gap-2 text-xs" key={q.id}><span>{q.title}</span><Btn variant="quiet" className="!px-2 !py-1" testId={`boss-complete-${q.id}`} disabled={q.status === 'completed' || isPending(`completeQuest:${q.id}`)} onClick={() => void run({ action: 'completeQuest', id: q.id, completed: true })}>{q.status === 'completed' ? 'Cleared' : 'Strike · finish quest'}</Btn></div>)}</div>}</div>)}</div>
            : <Empty title="NO BOSSES" detail="Weekly and overdue quests gather into bosses. Add quests to summon one."/>}</Panel>
      </div>
      <Panel><SectionHead eyebrow="OPTIONAL" title="Daily chest"/>
        <div data-testid="panel-chest" className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm text-[#b9b3c8]">{!s.chest.enabled ? 'The chest is off. Turn it on if you want an optional bonus after finishing every scheduled habit.' : s.chest.opened ? `Opened today: ${s.chest.outcome ?? 'prize collected'}.` : s.chest.eligible ? 'All scheduled habits are done. Your chest is ready.' : 'Complete every scheduled habit today to unlock it.'}</p>
            <ul className="mt-3 flex flex-wrap gap-2">{s.chest.rewards.map((r) => <li key={r.label} className="border border-[#49445d] px-2 py-1 font-mono text-[10px] text-[#d6cfae]">{r.label} {Math.round(pct(r.probability))}%</li>)}</ul>
            <p className="mt-2 text-[11px] text-[#837c96]">One draw per local day with a 24 hour cooldown. Prizes have no cash value and draws are never paid.</p></div>
          {!s.chest.enabled ? <Btn testId="button-enable-chest" variant="quiet" disabled={isPending('settings:')} onClick={() => void run({ action: 'settings', chestEnabled: true })}>Enable chest</Btn>
             : <Btn testId="button-draw-chest" disabled={!s.chest.eligible || s.chest.opened || isPending('drawChest:')} onClick={() => void run({ action: 'drawChest' })}><Gift size={16}/>{isPending('drawChest:') ? 'Opening...' : 'Open chest'}</Btn>}</div>
        {s.chest.history.length > 0 && <details className="mt-4 border-t border-[#49445d] pt-3 text-xs text-[#aaa4bb]"><summary className="cursor-pointer">Chest history ({s.chest.history.length})</summary><ul className="mt-3 space-y-2">{s.chest.history.map(h => <li key={h.date}>{h.date} · {h.outcome}</li>)}</ul></details>}</Panel>
    </>;
  }}</Gate>;
}
