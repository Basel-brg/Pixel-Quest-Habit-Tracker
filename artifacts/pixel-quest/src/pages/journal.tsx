import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { RpgWeek } from '@workspace/api-client-react';
import { Btn, Empty, Gate, Meter, PageHead, Panel, SectionHead, cx, fmtDate } from '@/components/kit';
import { SkillRadar } from '@/components/skill-radar';
import { buildCardSvg, downloadPng, downloadSvg } from '@/lib/share-card';
import { useRpg } from '@/lib/rpg-context';

const pct = (n: number) => Math.round(n <= 1 ? n * 100 : n);
function Week({ w }: { w: RpgWeek }) {
  return <div data-testid="panel-week"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Completion', `${pct(w.completionRate)}%`], ['Done', `${w.completed} / ${w.opportunities}`], ['XP', String(w.xp)], ['Gold', String(w.gold)]].map(([k, v]) => <div key={k} className="border border-[#49445d] bg-[#1c1a2b] p-3"><b className="block font-mono text-sm text-[#f5ca62]">{v}</b><span className="text-[11px] text-[#928ba4]">{k}</span></div>)}</div>
    <div className="mt-5 space-y-3">{w.habits.length ? w.habits.map((h) => <div key={h.id} data-testid={`week-habit-${h.id}`}><div className="mb-1 flex justify-between text-xs"><span className="truncate">{h.title}</span><span className="font-mono text-[10px] text-[#d6cfae]">{h.completed}/{h.opportunities} · {pct(h.rate)}%</span></div><Meter value={pct(h.rate)} max={100} label={h.title}/></div>) : <Empty title="NO HABIT DATA" detail="No habits were scheduled that week."/>}</div></div>;
}

export default function JournalPage() {
  const [which, setWhich] = useState<'current' | 'previous'>('current');
  const [inc, setInc] = useState({ level: true, streak: true, reward: true }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const { snap } = useRpg();
  const svg = useMemo(() => {
    if (!snap) return '';
    const latest = [...snap.rewards].filter((r) => r.status !== 'locked').sort((a, b) => new Date(b.claimedAt ?? b.createdAt).getTime() - new Date(a.claimedAt ?? a.createdAt).getTime())[0];
    return buildCardSvg({ username: snap.profile.username, avatarId: snap.profile.avatarId, level: inc.level ? snap.profile.level : undefined, streak: inc.streak ? snap.profile.highestHabitStreak : undefined, reward: inc.reward && latest ? `${latest.status === 'claimed' ? 'Claimed' : 'Ready'}: ${latest.title}` : undefined });
  }, [snap, inc]);
  return <Gate>{(s) => { const w = which === 'current' ? s.currentWeek : s.previousWeek; return <>
    <PageHead eyebrow="Weekly report" title="Journal" sub="A private look back. Nothing here is shared unless you download the card."/>
    <Panel><SectionHead eyebrow={`${fmtDate(w.start)} to ${fmtDate(w.end)}`} title={which === 'current' ? 'This week' : 'Last week'} action={<div className="flex gap-2">{(['current', 'previous'] as const).map((x) => <button key={x} data-testid={`tab-week-${x}`} aria-pressed={which === x} onClick={() => setWhich(x)} className={cx('border px-3 py-2 text-xs font-bold capitalize', which === x ? 'border-[#f5ca62] text-[#f5ca62]' : 'border-[#514967] text-[#9a93aa]')}>{x}</button>)}</div>}/><Week w={w}/></Panel>
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Panel><SectionHead eyebrow="CHARACTER" title="Skills"/><SkillRadar skills={s.skills}/></Panel>
      <Panel><SectionHead eyebrow="PRIVATE PIXEL PLAYER CARD" title="Share card"/>
        <div data-testid="preview-card" className="mx-auto max-w-[420px] border-2 border-[#514967]" dangerouslySetInnerHTML={{ __html: svg.replace(/width="600" height="340"/, 'width="100%"') }}/>
        <fieldset className="mt-4 flex flex-wrap gap-4 text-xs"><legend className="mb-2 text-xs font-bold text-[#b9b3c8]">Include on the card (avatar and name always shown)</legend>
          {([['level', 'Level'], ['streak', 'Best streak'], ['reward', 'Latest reward']] as const).map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" data-testid={`checkbox-card-${k}`} checked={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} className="accent-[#f5ca62]"/>{l}</label>)}</fieldset>
        <div className="mt-4 flex flex-wrap gap-2"><Btn testId="button-download-png" disabled={busy} onClick={() => { setBusy(true); setErr(''); downloadPng(svg).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false)); }}><Download size={15}/>{busy ? 'Rendering...' : 'Download PNG'}</Btn><Btn testId="button-download-svg" variant="quiet" onClick={() => downloadSvg(svg)}><Download size={15}/> Download SVG</Btn></div>
        {err && <p role="alert" className="mt-2 text-xs text-[#f29b83]">{err}</p>}</Panel></div>
  </>; }}</Gate>;
}
