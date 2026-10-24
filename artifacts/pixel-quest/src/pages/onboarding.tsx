import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Camera, Check, Lock, PenLine, RefreshCw, Shield, Sparkles } from 'lucide-react';
import { getGetRpgStateQueryKey, getRpgState, usePerformRpgAction, type AvatarId, type RpgActionInput, type RpgSnapshot } from '@workspace/api-client-react';
import { useRpg } from '@/lib/rpg-context';
import { THEME_IDS, THEME_META, useTheme, type ThemeId } from '@/lib/theme';
import { cue, reducedMotion } from '@/lib/feedback';
import { toast } from '@/hooks/use-toast';
import { Btn, Field, Panel, cx } from '@/components/kit';
import { SkillRadar } from '@/components/skill-radar';
import { PixelAvatar } from '@/components/pixel-avatar';
import {
  HABIT_PRESETS, PATHS, REWARD_PRESETS, STARTER_XP, errInfo, formFromServer, gateText, revisionOf, safeStep, stepError, toPayload, withPath, withReward,
  type DraftForm, type HeroPath, type RewardPresetId,
} from '@/lib/onboarding';

const STEPS = [
  { n: 1, en: 'The Call to Adventure', ar: 'نداء المغامرة' },
  { n: 2, en: 'Choose Your Hero Path', ar: 'تحديد مسار التطوير' },
  { n: 3, en: 'Forge Your First Habit', ar: 'صياغة العادة الأولى' },
  { n: 4, en: 'Lock Your First Real Reward', ar: 'قفل أول مكافأة واقعية' },
  { n: 5, en: 'The Journey Begins', ar: 'الانطلاق والمكافأة الترحيبية' },
];
export const themeThumb = (id: ThemeId) => `${import.meta.env.BASE_URL}onboarding/theme-${id}.png`;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict';
class Cancelled extends Error {}

/** Arrow-key navigation for radio-like groups (roving focus, RTL-agnostic). */
function arrowNav<T>(e: KeyboardEvent, items: readonly T[], current: T | null, pick: (v: T) => void) {
  const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const i = current == null ? -1 : items.indexOf(current);
  const next = items[(i + d + items.length) % items.length];
  pick(next);
  const group = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
}

export default function OnboardingPage() {
  const { serverSnap: live, snap, userId, isError, refetch } = useRpg();
  const { setPreview } = useTheme();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const qk = useMemo(() => [...getGetRpgStateQueryKey(), userId], [userId]);
  const mutation = usePerformRpgAction();
  const mutateRef = useRef(mutation.mutateAsync); mutateRef.current = mutation.mutateAsync;

  const [form, setForm] = useState<DraftForm | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'back' | 'finish' | 'skip' | 'reload'>('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [external, setExternal] = useState(false);
  const formRef = useRef(form); formRef.current = form;
  const revRef = useRef(0);
  const lastSaved = useRef('');
  const conflictRef = useRef(false);
  const inflight = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const actor = useRef(userId); actor.current = userId;
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstFocus = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; window.clearTimeout(timer.current); setPreview(null); }; }, [setPreview]);

  /** Replace local state with an authoritative server snapshot. */
  const adopt = useCallback((s: RpgSnapshot) => {
    const f = formFromServer(s.profile.onboardingDraft, s.profile);
    revRef.current = revisionOf(s);
    lastSaved.current = JSON.stringify(toPayload(f));
    conflictRef.current = false;
    setExternal(false); setSaveState('idle'); setErr('');
    setForm(f); setPreview(f.themeId);
  }, [setPreview]);

  // Account-scoped init from LIVE server data only (never the local cache).
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !userId || initFor.current === userId) return;
    initFor.current = userId; adopt(live);
  }, [live, userId, adopt]);

  // External change (another device/tab): adopt if clean, otherwise ask — never silently clobber.
  useEffect(() => {
    const f = formRef.current;
    if (!live || !f || initFor.current !== userId || inflight.current || live.profile.hasCompletedOnboarding) return;
    if (revisionOf(live) <= revRef.current) return;
    const dirty = JSON.stringify(toPayload(f)) !== lastSaved.current;
    if (dirty) setExternal(true); else adopt(live);
  }, [live, userId, adopt]);

  // Coming back to the tab re-checks the server (device handoff).
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible' && !inflight.current) void qc.invalidateQueries({ queryKey: qk }); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [qc, qk]);

  const send = useCallback(async (input: Omit<RpgActionInput, 'requestId'>) => {
    const me = actor.current;
    if (!me) throw new Cancelled();
    inflight.current++;
    try {
      await qc.cancelQueries({ queryKey: qk });
      const r = await mutateRef.current({ data: { ...input, requestId: crypto.randomUUID() } });
      if (!mounted.current || actor.current !== me) throw new Cancelled();
      revRef.current = revisionOf(r);
      await qc.cancelQueries({ queryKey: qk });
      qc.setQueryData(qk, r);
      return r;
    } finally { inflight.current--; }
  }, [qc, qk]);

  const fail = useCallback((e: unknown, explicit: boolean) => {
    if (e instanceof Cancelled) return;
    const { status, message } = errInfo(e);
    if (status === 409 && !/username/i.test(message)) { conflictRef.current = true; setSaveState('conflict'); return; }
    setSaveState('failed');
    if (explicit || /username/i.test(message)) setErr(message);
  }, []);

  /** Ordered, revision-aware draft save. Calls are serialized; each carries the latest confirmed revision. */
  const save = useCallback((f: DraftForm, step: number, explicit: boolean): Promise<boolean> => {
    const job = async () => {
      if (conflictRef.current) return false;
      const payload = toPayload(f, step); const body = JSON.stringify(payload);
      if (!explicit && body === lastSaved.current) return true;
      setSaveState('saving');
      try {
        await send({ action: 'onboardingDraft', onboardingDraft: payload, expectedOnboardingRevision: revRef.current });
        lastSaved.current = body; setSaveState('saved'); return true;
      } catch (e) { fail(e, explicit); return false; }
    };
    const p = chain.current.then(job, job);
    chain.current = p;
    return p;
  }, [send, fail]);

  // Debounced autosave of edits; pauses during explicit actions, conflicts and external changes.
  useEffect(() => {
    if (!form || busy || external || saveState === 'conflict') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { const f = formRef.current; if (f) void save(f, safeStep(f), false); }, 1200);
    return () => window.clearTimeout(timer.current);
  }, [form, busy, external, saveState, save]);

  // Announce + focus the heading on each step change.
  const step = form?.step;
  useEffect(() => {
    if (!step) return;
    if (firstFocus.current) { firstFocus.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [step]);

  const reloadServer = async () => {
    const me = actor.current;
    setBusy('reload'); window.clearTimeout(timer.current);
    try {
      await chain.current.catch(() => undefined);
      const s = await qc.fetchQuery({ queryKey: qk, queryFn: ({ signal }) => getRpgState({ signal }), staleTime: 0 });
      if (mounted.current && actor.current === me) adopt(s);
    } catch (e) { if (mounted.current && actor.current === me) setErr(errInfo(e).message); }
    finally { if (mounted.current) setBusy(''); }
  };
  const keepMine = () => {
    if (!live || !form) return;
    revRef.current = revisionOf(live); setExternal(false);
    void save(form, safeStep(form), true);
  };

  if (!form) {
    return <Frame><div className="mx-auto max-w-md px-4 pt-24 text-center">
      {isError && !live ? <Panel><Shield className="mx-auto mb-3 text-[color:var(--pq-gold)]"/><p className="mb-4 text-sm text-[color:var(--pq-ink2)]">We couldn't load your save file.</p><Btn testId="button-onboarding-retry" onClick={refetch}>Try again</Btn></Panel>
        : <div data-testid="status-onboarding-loading" aria-busy="true" aria-label="Loading your setup" className="space-y-3"><div className="h-6 animate-pulse bg-[color:var(--pq-panel)]"/><div className="h-48 animate-pulse bg-[color:var(--pq-panel)]"/></div>}
    </div></Frame>;
  }
  const f = form;
  const stalled = saveState === 'conflict' || external;
  const locked = !!busy || stalled;
  const set = (patch: Partial<DraftForm>) => { setErr(''); setForm((p) => (p ? { ...p, ...patch } : p)); };

  const go = async (to: number) => {
    if (to > f.step) { const e = stepError(f, f.step); if (e) { setErr(e); return; } }
    setBusy(to > f.step ? 'next' : 'back'); window.clearTimeout(timer.current); setErr('');
    const ok = await save(f, to, true);
    if (!mounted.current) return;
    setBusy('');
    if (ok) { cue(to === 5 ? 'fanfare' : 'click'); setForm((p) => (p ? { ...p, step: to } : p)); }
  };
  const finish = async () => {
    for (const s of [1, 2, 3, 4]) { const e = stepError(f, s); if (e) { setErr(e); return; } }
    const me = actor.current;
    setBusy('finish'); window.clearTimeout(timer.current); setErr('');
    await chain.current.catch(() => undefined);
    if (conflictRef.current) { setBusy(''); return; }
    try {
      const r = await send({ action: 'completeOnboarding', onboardingDraft: toPayload(f, 5), expectedOnboardingRevision: revRef.current });
      if (actor.current !== me) return;
      if (!r.profile.hasCompletedOnboarding) throw new Error('Camp did not confirm your setup. Try again.');
      if (r.effect === 'reward') {
        cue('fanfare');
        toast({ title: `+${STARTER_XP} XP — welcome to camp`, description: 'Your first habit and locked reward are ready.' });
      }
      navigate('/camp', { replace: true });
    } catch (e) {
      if (!mounted.current || e instanceof Cancelled) return;
      fail(e, true);
      if (/username/i.test(errInfo(e).message)) setForm((p) => (p ? { ...p, step: 1 } : p));
      setBusy('');
    }
  };
  const skip = async () => {
    setBusy('skip'); window.clearTimeout(timer.current); setErr('');
    try {
      await chain.current.catch(() => undefined);
      const r = await send({ action: 'skipOnboarding' });
      if (r.profile.hasCompletedOnboarding) { navigate('/camp', { replace: true }); return; }
      throw new Error('Skip was not confirmed. Try again.');
    } catch (e) { if (!mounted.current || e instanceof Cancelled) return; setErr(errInfo(e).message); setBusy(''); }
  };
  const pickTheme = (t: ThemeId) => { if (locked) return; set({ themeId: t }); setPreview(t); cue('click'); };
  const pickPath = (p: HeroPath) => { if (locked) return; set(withPath(f, p)); cue('click'); };
  const pickReward = (id: RewardPresetId) => { if (locked) return; set(withReward(id, f)); cue('click'); };
  const meta = STEPS[f.step - 1];
  const itemGate = f.rewardPresetId === 'item';
  const pathName = PATHS.find((p) => p.id === f.heroPath)?.name;
  const next = () => { if (!locked) void (f.step < 5 ? go(f.step + 1) : finish()); };

  return <Frame>
    <header className="sticky top-0 z-30 border-b-2 border-[color:var(--pq-line)] bg-[color:var(--pq-bg)]/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <span className="pixel-title text-[10px] text-[color:var(--pq-gold)]">PIXEL QUEST</span>
        <ol className="flex items-center gap-1.5" aria-label={`Setup progress: step ${f.step} of 5`}>{STEPS.map((s) => <li key={s.n} data-testid={`progress-step-${s.n}`} aria-current={s.n === f.step ? 'step' : undefined} aria-label={`Step ${s.n}: ${s.en}${s.n < f.step ? ' (done)' : ''}`} className={cx('h-2.5 transition-all', s.n === f.step ? 'w-8 bg-[color:var(--pq-gold)]' : s.n < f.step ? 'w-2.5 bg-[color:var(--pq-cyan)]' : 'w-2.5 bg-[color:var(--pq-line)]')}/>)}</ol>
        <button type="button" data-testid="button-onboarding-skip" disabled={!!busy} onClick={() => void skip()} className="text-xs font-bold text-[color:var(--pq-mute2)] underline-offset-4 hover:text-[color:var(--pq-ink)] hover:underline disabled:opacity-40">{busy === 'skip' ? 'Skipping…' : <>Skip setup (<span lang="ar" dir="rtl">تخطي</span>)</>}</button>
      </div>
    </header>

    <form className="mx-auto max-w-5xl px-4 pb-48 pt-8 md:pt-12" data-testid={`onboarding-step-${f.step}`} onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
      <p aria-live="polite" className="sr-only">{`Step ${f.step} of 5: ${meta.en}`}</p>
      <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[color:var(--pq-cyan)]">Step {f.step} of 5 · <span lang="ar" dir="rtl">{meta.ar}</span></p>
      <h1 ref={headingRef} tabIndex={-1} className="pixel-title mt-3 text-[17px] text-[color:var(--pq-ink)] outline-none md:text-[24px]">{meta.en}</h1>

      {stalled && <div role="alert" data-testid="status-onboarding-conflict" className="mt-6 flex flex-wrap items-center gap-3 border-2 border-[color:var(--pq-gold)] bg-[color:var(--pq-panel)] p-4">
        <RefreshCw size={16} className="text-[color:var(--pq-gold)]"/>
        <p className="flex-1 text-sm text-[color:var(--pq-ink2)]">{saveState === 'conflict' ? 'Your setup was changed on another device, so this edit was not saved.' : 'Your setup changed on another device while you were editing here.'}</p>
        <Btn testId="button-onboarding-reload-draft" disabled={busy === 'reload'} onClick={() => void reloadServer()}>{busy === 'reload' ? 'Loading…' : 'Load saved setup'}</Btn>
        {external && saveState !== 'conflict' && <Btn testId="button-onboarding-keep-mine" variant="quiet" onClick={keepMine}>Keep my edits</Btn>}
      </div>}

      <div key={f.step} className="quest-card mt-8">
        {f.step === 1 && <div className="space-y-8">
          <Panel className="max-w-md">
            <Field label="Hero name" hint="3–20 letters, numbers or underscore. Must be unique."><input data-testid="input-onboarding-username" className="field" value={f.username} maxLength={20} disabled={locked} autoComplete="username" spellCheck={false} aria-invalid={!!f.username && !!stepError(f, 1)} onChange={(e) => set({ username: e.target.value })} placeholder="e.g. Layla_Ironleaf"/></Field>
          </Panel>
          <div>
            <p id="theme-help" className="mb-4 text-sm text-[color:var(--pq-mute)]">Pick the world your hero lives in. Tap to preview it live — it's saved with your setup.</p>
            <div role="radiogroup" aria-label="World theme" aria-describedby="theme-help" onKeyDown={(e) => arrowNav(e, THEME_IDS, f.themeId, pickTheme)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {THEME_IDS.map((t) => { const sel = f.themeId === t; return <button key={t} type="button" role="radio" aria-checked={sel} tabIndex={sel ? 0 : -1} aria-label={`${THEME_META[t].name}: ${THEME_META[t].blurb}`} data-testid={`card-theme-${t}`} disabled={locked} onClick={() => pickTheme(t)} className={cx('group relative overflow-hidden border-2 bg-[color:var(--pq-panel)] text-left transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--pq-cyan)]', sel ? 'border-[color:var(--pq-gold)] shadow-[4px_4px_0_var(--pq-shadow)]' : 'border-[color:var(--pq-line)]')}>
                <img src={themeThumb(t)} alt="" loading="lazy" className="block aspect-[3/2] w-full object-cover" style={{ imageRendering: t === 'retro' ? 'pixelated' : undefined }}/>
                <span className="flex items-center justify-between gap-2 px-3 py-2.5"><span><b className="block text-sm text-[color:var(--pq-ink)]">{THEME_META[t].name}</b><span className="text-[11px] text-[color:var(--pq-mute)]">{THEME_META[t].blurb}</span></span>{sel && <Check size={18} aria-hidden className="shrink-0 text-[color:var(--pq-gold)]"/>}</span>
              </button>; })}
            </div>
          </div>
        </div>}

        {f.step === 2 && <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div role="radiogroup" aria-label="Hero path" onKeyDown={(e) => arrowNav(e, PATHS.map((p) => p.id), f.heroPath, pickPath)} className="space-y-3">
            {PATHS.map((p, i) => { const sel = f.heroPath === p.id; return <button key={p.id} type="button" role="radio" aria-checked={sel} tabIndex={sel || (!f.heroPath && i === 0) ? 0 : -1} data-testid={`card-path-${p.id}`} disabled={locked} onClick={() => pickPath(p.id)} className={cx('flex w-full items-center gap-4 border-2 bg-[color:var(--pq-panel)] p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--pq-cyan)]', sel ? 'border-[color:var(--pq-gold)]' : 'border-[color:var(--pq-line)]')}>
              <span aria-hidden className={cx('grid h-12 w-12 shrink-0 place-items-center font-mono text-sm font-bold', sel ? 'bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]' : 'bg-[color:var(--pq-panel2)] text-[color:var(--pq-cyan)]')}>{p.id}</span>
              <span className="flex-1"><b className="block text-[15px] text-[color:var(--pq-ink)]">{p.name} <span lang="ar" dir="rtl" className="text-[color:var(--pq-mute)]">({p.ar})</span></b><span className="text-xs text-[color:var(--pq-mute)]">{p.focus} · grows {p.stat}</span></span>
              {sel && <Check aria-hidden className="text-[color:var(--pq-gold)]"/>}</button>; })}
          </div>
          <Panel>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-mute)]">Your radar</p>
            <p className="mb-3 text-xs text-[color:var(--pq-ink2)]">{f.heroPath ? `Your first habit will train ${f.heroPath}. Points arrive only when you complete it — no free stats.` : 'Choose a path to see which axis your habits will grow.'}</p>
            <SkillRadar skills={(live ?? snap)!.skills} highlight={f.heroPath}/>
          </Panel>
        </div>}

        {f.step === 3 && <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p id="habit-presets-label" className="mb-3 text-sm text-[color:var(--pq-mute)]">One-tap presets for the {pathName ?? 'chosen path'}:</p>
            <div role="group" aria-labelledby="habit-presets-label" className="flex flex-wrap gap-2">
              {HABIT_PRESETS[(f.heroPath ?? 'STR') as HeroPath].map((h) => { const sel = f.habitPresetId === h.id; return <button key={h.id} type="button" lang="ar" dir="rtl" data-testid={`preset-habit-${h.id}`} aria-pressed={sel} disabled={locked} onClick={() => { set({ habitPresetId: h.id, habitTitle: h.title, habitTarget: String(h.target), habitUnit: h.unit }); cue('click'); }} className={cx('pixel-button border-2 px-4 py-3 text-sm font-bold', sel ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]' : 'border-[color:var(--pq-line)] bg-[color:var(--pq-panel)] text-[color:var(--pq-ink)]')}>{h.title}</button>; })}
              <button type="button" data-testid="preset-habit-custom" aria-pressed={f.habitPresetId === 'custom'} disabled={locked} onClick={() => { set({ habitPresetId: 'custom', habitTitle: '', habitTarget: '1', habitUnit: '' }); cue('click'); }} className={cx('pixel-button flex items-center gap-2 border-2 px-4 py-3 text-sm font-bold', f.habitPresetId === 'custom' ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]' : 'border-dashed border-[color:var(--pq-line)] bg-transparent text-[color:var(--pq-ink2)]')}><PenLine size={14} aria-hidden/> Write my own</button>
            </div>
          </div>
          <Panel className="space-y-4">
            <Field label="Habit name"><input data-testid="input-onboarding-habit-title" className="field" dir="auto" maxLength={120} disabled={locked} value={f.habitTitle} onChange={(e) => set({ habitTitle: e.target.value, habitPresetId: f.habitPresetId ?? 'custom' })} placeholder="Walk after dinner"/></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily target"><input data-testid="input-onboarding-habit-target" className="field" inputMode="decimal" disabled={locked} value={f.habitTarget} onChange={(e) => set({ habitTarget: e.target.value })}/></Field>
              <Field label="Unit"><input data-testid="input-onboarding-habit-unit" className="field" dir="auto" maxLength={30} disabled={locked} value={f.habitUnit} onChange={(e) => set({ habitUnit: e.target.value })} placeholder="minutes"/></Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 border border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)] p-3">
              <input type="checkbox" data-testid="toggle-onboarding-photo-proof" className="mt-1 h-4 w-4 accent-[color:var(--pq-gold)]" disabled={locked} checked={f.requiresPhotoProof} onChange={(e) => set({ requiresPhotoProof: e.target.checked })}/>
              <span><b className="flex items-center gap-1.5 text-sm text-[color:var(--pq-ink)]"><Camera size={14} aria-hidden/> Require Photo Proof (📸)</b><span lang="ar" dir="rtl" className="mt-1 block text-xs text-[color:var(--pq-mute)]">يتطلب إثباتاً بالصورة للحصول على الـ XP</span></span>
            </label>
            <p className="text-[11px] text-[color:var(--pq-mute)]">Daily · trains {f.heroPath ?? '—'} · never auto-completed</p>
          </Panel>
        </div>}

        {f.step === 4 && <div className="space-y-6">
          <p id="reward-q" lang="ar" dir="rtl" className="text-[15px] text-[color:var(--pq-ink2)]">ما المكافأة الواقعية التي تستحق أن تكافئ بها نفسك عند الالتزام؟</p>
          <div role="radiogroup" aria-labelledby="reward-q" onKeyDown={(e) => arrowNav(e, REWARD_PRESETS.map((r) => r.id), f.rewardPresetId, pickReward)} className="grid gap-3 md:grid-cols-3">
            {REWARD_PRESETS.map((r, i) => { const sel = f.rewardPresetId === r.id; return <button key={r.id} type="button" role="radio" aria-checked={sel} tabIndex={sel || (!f.rewardPresetId && i === 0) ? 0 : -1} data-testid={`preset-reward-${r.id}`} disabled={locked} onClick={() => pickReward(r.id)} className={cx('flex flex-col gap-3 border-2 bg-[color:var(--pq-panel)] p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--pq-cyan)]', sel ? 'border-[color:var(--pq-gold)] shadow-[4px_4px_0_var(--pq-shadow)]' : 'border-[color:var(--pq-line)]')}>
              <b lang="ar" dir="rtl" className="w-full text-[15px] text-[color:var(--pq-ink)]">{r.title}</b>
              <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--pq-mute)]"><Lock size={12} aria-hidden/> {r.fixed ? `Locked until ${gateText(r.streak)}` : 'Level 2 — add a streak if you like'}</span></button>; })}
          </div>
          {f.rewardPresetId && <Panel className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Reward title"><input data-testid="input-onboarding-reward-title" className="field" dir="auto" maxLength={120} disabled={locked} value={f.rewardTitle} onChange={(e) => set({ rewardTitle: e.target.value })} placeholder="New headphones"/></Field>
            <Field label="Streak (days)" hint={itemGate ? '0 = Level 2 only' : 'Fixed for this reward'}><input data-testid="input-onboarding-reward-streak" className="field disabled:opacity-60" inputMode="numeric" disabled={locked || !itemGate} aria-describedby="reward-gate" value={f.rewardStreak} onChange={(e) => set({ rewardStreak: e.target.value.replace(/[^\d]/g, '') })}/></Field>
            <p id="reward-gate" data-testid="text-onboarding-reward-gate" className="flex items-center gap-1.5 text-[11px] text-[color:var(--pq-mute)] sm:col-span-2"><Lock size={11} aria-hidden/> Unlocks at {gateText(f.rewardStreak || 0)}{Number(f.rewardStreak) > 0 ? ' on your first habit' : ''}. No gold cost.{!itemGate && ' Pick the item reward to choose your own gate.'}</p>
          </Panel>}
        </div>}

        {f.step === 5 && <div className="relative grid gap-5 md:grid-cols-[auto_1fr]">
          {!reducedMotion() && <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">{Array.from({ length: 12 }, (_, i) => <i key={i} className="pixel-spark absolute h-2 w-2" style={{ left: `${(i * 37) % 96}%`, top: `${15 + (i * 23) % 65}%`, background: ['var(--pq-gold)', 'var(--pq-cyan)', 'var(--pq-purple)'][i % 3], animationDelay: `${i * 35}ms`, borderRadius: f.themeId === 'cozy' ? '50%' : 0 }}/>)}</div>}
          <Panel className="flex flex-col items-center gap-3 text-center">
            <PixelAvatar id={(live ?? snap)!.profile.avatarId as AvatarId} size={132} themeId={f.themeId} testId="img-onboarding-avatar"/>
            <b data-testid="text-onboarding-username" className="pixel-title text-[12px] text-[color:var(--pq-ink)]">{f.username}</b>
            <span className="text-[11px] text-[color:var(--pq-mute)]">{pathName}</span>
          </Panel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Summary label="World"><img src={themeThumb(f.themeId)} alt={`${THEME_META[f.themeId].name} camp preview`} className="mb-2 aspect-[3/2] w-full object-cover"/>{THEME_META[f.themeId].name}</Summary>
            <div className="grid gap-3">
              <Summary label="First habit" testId="text-onboarding-habit"><span dir="auto" className="block">{f.habitTitle}</span><span className="block text-[11px] text-[color:var(--pq-mute)]">{f.habitTarget} <span dir="auto">{f.habitUnit}</span> daily · {f.heroPath}{f.requiresPhotoProof ? ' · photo proof' : ''}</span></Summary>
              <Summary label="Locked reward" testId="text-onboarding-reward"><span dir="auto" className="block">{f.rewardTitle}</span><span className="flex items-center gap-1 text-[11px] text-[color:var(--pq-mute)]"><Lock size={11} aria-hidden/> {gateText(f.rewardStreak || 0)}</span></Summary>
            </div>
          </div>
          <div data-testid="status-starter-xp" className="flex items-center gap-4 border-2 border-dashed border-[color:var(--pq-line)] p-4 md:col-span-2">
            <Sparkles aria-hidden className="text-[color:var(--pq-gold)]"/>
            <div><b className="pixel-title text-[13px] text-[color:var(--pq-gold)]">+{STARTER_XP} XP <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-mute)]">pending</span></b><p className="text-xs text-[color:var(--pq-mute)]">Awarded once, when camp confirms your setup. No gold, no free skill points.</p></div>
          </div>
        </div>}
      </div>
    </form>

    <footer className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[color:var(--pq-line)] bg-[color:var(--pq-bg)]/95 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      {err && <p role="alert" data-testid="status-onboarding-error" className="mx-auto max-w-5xl px-4 pt-3 text-xs text-[color:var(--pq-danger)]">{err}</p>}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3">
        <Btn testId="button-onboarding-back" variant="quiet" disabled={f.step === 1 || locked} onClick={() => void go(f.step - 1)}><ArrowLeft size={15} aria-hidden/> {busy === 'back' ? 'Saving…' : 'Back'}</Btn>
        <span data-testid="status-onboarding-save" aria-live="polite" className="flex items-center gap-2 text-[11px] text-[color:var(--pq-mute)]">
          {saveState === 'saving' ? 'Saving draft…' : saveState === 'saved' ? 'Draft saved' : saveState === 'failed' ? <>Draft not saved <button type="button" data-testid="button-onboarding-save-retry" disabled={!!busy} onClick={() => void save(f, safeStep(f), true)} className="font-bold text-[color:var(--pq-cyan)] underline underline-offset-2">Retry</button></> : ''}
        </span>
        {f.step < 5
          ? <Btn testId="button-onboarding-next" disabled={locked} onClick={next}>{busy === 'next' ? 'Saving…' : 'Next'} <ArrowRight size={15} aria-hidden/></Btn>
          : <Btn testId="button-onboarding-finish" disabled={locked} onClick={next}>{busy === 'finish' ? 'Entering…' : <>Enter Camp (<span lang="ar" dir="rtl">ابدأ المغامرة</span>)</>}</Btn>}
      </div>
    </footer>
  </Frame>;
}

function Frame({ children }: { children: ReactNode }) { return <div className="scanlines min-h-[100dvh]">{children}</div>; }
function Summary({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return <div data-testid={testId} className="pixel-border bg-[color:var(--pq-panel)] p-4"><p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-cyan)]">{label}</p><div className="text-sm font-bold text-[color:var(--pq-ink)]">{children}</div></div>;
}
