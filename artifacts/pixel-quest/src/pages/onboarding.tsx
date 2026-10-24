import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Camera, Check, Lock, Shield, Sparkles } from 'lucide-react';
import type { AvatarId } from '@workspace/api-client-react';
import { useRpg } from '@/lib/rpg-context';
import { THEME_IDS, THEME_META, useTheme, type ThemeId } from '@/lib/theme';
import { cue, reducedMotion } from '@/lib/feedback';
import { Btn, Field, Panel, cx } from '@/components/kit';
import { SkillRadar } from '@/components/skill-radar';
import { PixelAvatar } from '@/components/pixel-avatar';
import { HABIT_PRESETS, PATHS, REWARD_PRESETS, STARTER_XP, formFromServer, stepError, toPayload, type DraftForm, type HeroPath } from '@/lib/onboarding';

const STEPS = [
  { n: 1, en: 'The Call to Adventure', ar: 'نداء المغامرة' },
  { n: 2, en: 'Choose Your Hero Path', ar: 'تحديد مسار التطوير' },
  { n: 3, en: 'Forge Your First Habit', ar: 'صياغة العادة الأولى' },
  { n: 4, en: 'Lock Your First Real Reward', ar: 'قفل أول مكافأة واقعية' },
  { n: 5, en: 'The Journey Begins', ar: 'الانطلاق والمكافأة الترحيبية' },
];
/** True while the finish celebration plays, so the route gate doesn't cut it short. */
export const finishing = { current: false };
export const themeThumb = (id: ThemeId) => `${import.meta.env.BASE_URL}onboarding/theme-${id}.png`;

export default function OnboardingPage() {
  const { snap, run, userId, error, clearError, isError, refetch } = useRpg();
  const { setPreview } = useTheme();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<DraftForm | null>(null);
  const [localErr, setLocalErr] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'finish' | 'skip'>('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [done, setDone] = useState(false);
  const initFor = useRef<string | null>(null);
  const lastSaved = useRef('');
  const timer = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const runRef = useRef(run); runRef.current = run;
  const actor = useRef(userId); actor.current = userId;

  // Account-scoped init: once per identity, never re-seeded by refetches.
  useEffect(() => {
    if (!snap || !userId || initFor.current === userId) return;
    initFor.current = userId;
    const f = formFromServer(snap.profile.onboardingDraft, snap.profile);
    lastSaved.current = JSON.stringify(toPayload(f));
    setForm(f); setPreview(f.themeId);
  }, [snap, userId, setPreview]);
  useEffect(() => () => { window.clearTimeout(timer.current); setPreview(null); }, [setPreview]);

  const save = useCallback(async (f: DraftForm, step: number, silent: boolean) => {
    const payload = toPayload(f, step); const body = JSON.stringify(payload);
    if (silent && body === lastSaved.current) return true;
    const me = actor.current;
    setSaveState('saving');
    const r = await runRef.current({ action: 'onboardingDraft', onboardingDraft: payload }, { key: 'onboarding:draft' });
    if (actor.current !== me) return false;
    if (r) { lastSaved.current = body; setSaveState('saved'); return true; }
    setSaveState('failed'); if (silent) clearError();
    return false;
  }, [clearError]);

  // Debounced autosave of edits (skipped while an explicit action runs).
  useEffect(() => {
    if (!form || busyRef.current || done) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!busyRef.current) void save(form, form.step, true); }, 1400);
    return () => window.clearTimeout(timer.current);
  }, [form, save, done]);

  // Server rejects a taken/invalid username at finish: send the hero back to step 1 to fix it.
  useEffect(() => { if (busy === '' && /username/i.test(error)) setForm((p) => (p && p.step === 5 ? { ...p, step: 1 } : p)); }, [error, busy]);

  if (!form) {
    return <Frame><div className="mx-auto max-w-md pt-24 text-center">
      {isError ? <Panel><Shield className="mx-auto mb-3 text-[color:var(--pq-gold)]"/><p className="mb-4 text-sm text-[color:var(--pq-ink2)]">We couldn't load your save file.</p><Btn testId="button-onboarding-retry" onClick={refetch}>Try again</Btn></Panel>
        : <div data-testid="status-onboarding-loading" className="space-y-3"><div className="h-6 animate-pulse bg-[color:var(--pq-panel)]"/><div className="h-48 animate-pulse bg-[color:var(--pq-panel)]"/></div>}
    </div></Frame>;
  }
  const f = form;
  const set = (patch: Partial<DraftForm>) => { setLocalErr(''); setForm((p) => (p ? { ...p, ...patch } : p)); };
  const locked = !!busy || done;

  const go = async (to: number) => {
    if (to > f.step) { const e = stepError(f, f.step); if (e) { setLocalErr(e); return; } }
    busyRef.current = true; setBusy('next'); window.clearTimeout(timer.current); clearError();
    const ok = await save(f, to, false);
    busyRef.current = false; setBusy('');
    if (ok) { cue('click'); setForm((p) => (p ? { ...p, step: to } : p)); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
  };
  const back = () => { if (f.step > 1) { cue('click'); set({ step: f.step - 1 }); } };
  const finish = async () => {
    for (const s of [1, 2, 3, 4]) { const e = stepError(f, s); if (e) { setLocalErr(e); set({ step: s }); return; } }
    finishing.current = true; busyRef.current = true; setBusy('finish'); window.clearTimeout(timer.current); clearError();
    const r = await run({ action: 'completeOnboarding', onboardingDraft: toPayload(f, 5) }, { key: 'onboarding:complete' });
    if (r?.profile.hasCompletedOnboarding) {
      setDone(true); cue('fanfare');
      window.setTimeout(() => { finishing.current = false; navigate('/camp', { replace: true }); }, reducedMotion() ? 200 : 1600);
      return;
    }
    finishing.current = false; busyRef.current = false; setBusy('');
  };
  const skip = async () => {
    busyRef.current = true; setBusy('skip'); window.clearTimeout(timer.current); clearError();
    const r = await run({ action: 'skipOnboarding' }, { key: 'onboarding:skip' });
    if (r?.profile.hasCompletedOnboarding) { navigate('/camp', { replace: true }); return; }
    busyRef.current = false; setBusy('');
  };
  const pickTheme = (t: ThemeId) => { if (locked) return; set({ themeId: t }); setPreview(t); cue('click'); };
  const meta = STEPS[f.step - 1];
  const shownErr = localErr || error;

  return <Frame>
    <header className="sticky top-0 z-30 border-b-2 border-[color:var(--pq-line)] bg-[color:var(--pq-bg)]/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <span className="pixel-title text-[10px] text-[color:var(--pq-gold)]">PIXEL QUEST</span>
        <ol className="flex items-center gap-1.5" aria-label="Progress">{STEPS.map((s) => <li key={s.n} data-testid={`progress-step-${s.n}`} aria-current={s.n === f.step ? 'step' : undefined} className={cx('h-2.5 transition-all', s.n === f.step ? 'w-8 bg-[color:var(--pq-gold)]' : s.n < f.step ? 'w-2.5 bg-[color:var(--pq-cyan)]' : 'w-2.5 bg-[color:var(--pq-line)]')}/>)}</ol>
        <button type="button" data-testid="button-onboarding-skip" disabled={locked} onClick={skip} className="text-xs font-bold text-[color:var(--pq-mute2)] underline-offset-4 hover:text-[color:var(--pq-ink)] hover:underline disabled:opacity-40">{busy === 'skip' ? 'Skipping…' : 'Skip setup (تخطي)'}</button>
      </div>
    </header>

    <main className="mx-auto max-w-5xl px-4 pb-40 pt-8 md:pt-12" data-testid={`onboarding-step-${f.step}`}>
      <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[color:var(--pq-cyan)]">Step {f.step} of 5 · <span dir="rtl">{meta.ar}</span></p>
      <h1 className="pixel-title mt-3 text-[17px] text-[color:var(--pq-ink)] md:text-[24px]">{meta.en}</h1>

      <div key={f.step} className="quest-card mt-8">
        {f.step === 1 && <div className="space-y-8">
          <Panel className="max-w-md">
            <Field label="Hero name" hint="3–20 letters, numbers or underscore. Must be unique."><input data-testid="input-onboarding-username" className="field" value={f.username} maxLength={20} disabled={locked} autoComplete="username" onChange={(e) => set({ username: e.target.value })} placeholder="e.g. Layla_Ironleaf"/></Field>
          </Panel>
          <div>
            <p className="mb-4 text-sm text-[color:var(--pq-mute)]">Pick the world your hero lives in. It changes everything — tap to preview live.</p>
            <div role="radiogroup" aria-label="Theme" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {THEME_IDS.map((t) => { const sel = f.themeId === t; return <button key={t} type="button" role="radio" aria-checked={sel} data-testid={`card-theme-${t}`} disabled={locked} onClick={() => pickTheme(t)} className={cx('group relative overflow-hidden border-2 bg-[color:var(--pq-panel)] text-left transition-transform hover:-translate-y-0.5', sel ? 'border-[color:var(--pq-gold)] shadow-[4px_4px_0_var(--pq-shadow)]' : 'border-[color:var(--pq-line)]')}>
                <img src={themeThumb(t)} alt={`${THEME_META[t].name} Camp preview`} loading="lazy" className="block aspect-[3/2] w-full object-cover" style={{ imageRendering: t === 'retro' ? 'pixelated' : undefined }}/>
                <span className="flex items-center justify-between gap-2 px-3 py-2.5"><span><b className="block text-sm text-[color:var(--pq-ink)]">{THEME_META[t].name}</b><span className="text-[11px] text-[color:var(--pq-mute)]">{THEME_META[t].blurb}</span></span>{sel && <Check size={18} className="shrink-0 text-[color:var(--pq-gold)]"/>}</span>
              </button>; })}
            </div>
          </div>
        </div>}

        {f.step === 2 && <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div role="radiogroup" aria-label="Hero path" className="space-y-3">
            {PATHS.map((p) => { const sel = f.heroPath === p.id; return <button key={p.id} type="button" role="radio" aria-checked={sel} data-testid={`card-path-${p.id}`} disabled={locked} onClick={() => { set({ heroPath: p.id }); cue('click'); }} className={cx('flex w-full items-center gap-4 border-2 bg-[color:var(--pq-panel)] p-4 text-left', sel ? 'border-[color:var(--pq-gold)]' : 'border-[color:var(--pq-line)]')}>
              <span className={cx('grid h-12 w-12 shrink-0 place-items-center font-mono text-sm font-bold', sel ? 'bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]' : 'bg-[color:var(--pq-panel2)] text-[color:var(--pq-cyan)]')}>{p.id}</span>
              <span className="flex-1"><b className="block text-[15px] text-[color:var(--pq-ink)]">{p.name} <span dir="rtl" className="text-[color:var(--pq-mute)]">({p.ar})</span></b><span className="text-xs text-[color:var(--pq-mute)]">{p.focus} · grows {p.stat}</span></span>
              {sel && <Check className="text-[color:var(--pq-gold)]"/>}</button>; })}
          </div>
          <Panel>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-mute)]">Your radar</p>
            <p className="mb-3 text-xs text-[color:var(--pq-ink2)]">{f.heroPath ? `Your first habit will train ${f.heroPath}. Points arrive only when you complete it — no free stats.` : 'Choose a path to see which axis your habits will grow.'}</p>
            <SkillRadar skills={snap!.skills} highlight={f.heroPath}/>
          </Panel>
        </div>}

        {f.step === 3 && <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-3 text-sm text-[color:var(--pq-mute)]">One-click presets for the {PATHS.find((p) => p.id === f.heroPath)?.name ?? 'chosen path'}:</p>
            <div className="flex flex-wrap gap-2">{(HABIT_PRESETS[(f.heroPath ?? 'STR') as HeroPath]).map((h) => { const sel = f.habitTitle === h.title; return <button key={h.id} type="button" data-testid={`preset-habit-${h.id}`} aria-pressed={sel} disabled={locked} onClick={() => { set({ habitTitle: h.title, habitTarget: String(h.target), habitUnit: h.unit }); cue('click'); }} className={cx('pixel-button border-2 px-4 py-3 text-sm font-bold', sel ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-gold)] text-[color:var(--pq-onaccent)]' : 'border-[color:var(--pq-line)] bg-[color:var(--pq-panel)] text-[color:var(--pq-ink)]')} dir="rtl">{h.title}</button>; })}</div>
          </div>
          <Panel className="space-y-4">
            <Field label="Habit name (or write your own)"><input data-testid="input-onboarding-habit-title" className="field" maxLength={120} disabled={locked} value={f.habitTitle} onChange={(e) => set({ habitTitle: e.target.value })} placeholder="Walk after dinner"/></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily target"><input data-testid="input-onboarding-habit-target" className="field" inputMode="decimal" disabled={locked} value={f.habitTarget} onChange={(e) => set({ habitTarget: e.target.value })}/></Field>
              <Field label="Unit"><input data-testid="input-onboarding-habit-unit" className="field" maxLength={30} disabled={locked} value={f.habitUnit} onChange={(e) => set({ habitUnit: e.target.value })} placeholder="minutes"/></Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 border border-[color:var(--pq-line)] bg-[color:var(--pq-panel2)] p-3">
              <input type="checkbox" data-testid="toggle-onboarding-photo-proof" className="mt-1 h-4 w-4 accent-[color:var(--pq-gold)]" disabled={locked} checked={f.requiresPhotoProof} onChange={(e) => set({ requiresPhotoProof: e.target.checked })}/>
              <span><b className="flex items-center gap-1.5 text-sm text-[color:var(--pq-ink)]"><Camera size={14}/> Require Photo Proof (📸)</b><span dir="rtl" className="mt-1 block text-xs text-[color:var(--pq-mute)]">يتطلب إثباتاً بالصورة للحصول على الـ XP</span></span>
            </label>
            <p className="text-[11px] text-[color:var(--pq-mute)]">Daily · trains {f.heroPath ?? '—'}</p>
          </Panel>
        </div>}

        {f.step === 4 && <div className="space-y-6">
          <p dir="rtl" className="text-[15px] text-[color:var(--pq-ink2)]">ما المكافأة الواقعية التي تستحق أن تكافئ بها نفسك عند الالتزام؟</p>
          <div className="grid gap-3 md:grid-cols-3">{REWARD_PRESETS.map((r) => { const sel = f.rewardTitle === r.title; return <button key={r.id} type="button" data-testid={`preset-reward-${r.id}`} aria-pressed={sel} disabled={locked} onClick={() => { set({ rewardTitle: r.title, rewardStreak: String(r.streak) }); cue('click'); }} className={cx('flex flex-col gap-3 border-2 bg-[color:var(--pq-panel)] p-4 text-left', sel ? 'border-[color:var(--pq-gold)] shadow-[4px_4px_0_var(--pq-shadow)]' : 'border-[color:var(--pq-line)]')}>
            <b dir="rtl" className="text-[15px] text-[color:var(--pq-ink)]">{r.title}</b>
            <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--pq-mute)]"><Lock size={12}/> Locked until {r.hint}</span></button>; })}</div>
          <Panel className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Reward title"><input data-testid="input-onboarding-reward-title" className="field" maxLength={120} disabled={locked} value={f.rewardTitle} onChange={(e) => set({ rewardTitle: e.target.value })} placeholder="New headphones"/></Field>
            <Field label="Streak (days)"><input data-testid="input-onboarding-reward-streak" className="field" inputMode="numeric" disabled={locked} value={f.rewardStreak} onChange={(e) => set({ rewardStreak: e.target.value })}/></Field>
            <p className="text-[11px] text-[color:var(--pq-mute)] sm:col-span-2">Unlocks at Level 2 AND a {f.rewardStreak || '?'}-day streak on your first habit.</p>
          </Panel>
        </div>}

        {f.step === 5 && <div className="relative">
          {done && !reducedMotion() && <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">{Array.from({ length: 40 }, (_, i) => <i key={i} className="pixel-spark absolute h-2.5 w-2.5" style={{ left: `${(i * 37) % 97}%`, top: `${15 + ((i * 23) % 60)}%`, background: ['var(--pq-gold)', 'var(--pq-cyan)', 'var(--pq-purple)', 'var(--pq-danger)'][i % 4], animationDelay: `${(i % 10) * 40}ms` }}/>)}</div>}
          <div className="grid gap-5 md:grid-cols-[auto_1fr]">
            <Panel className="flex flex-col items-center gap-3 text-center">
              <PixelAvatar id={snap!.profile.avatarId as AvatarId} size={132} themeId={f.themeId} testId="img-onboarding-avatar"/>
              <b data-testid="text-onboarding-username" className="pixel-title text-[12px] text-[color:var(--pq-ink)]">{f.username}</b>
              <span className="text-[11px] text-[color:var(--pq-mute)]">{PATHS.find((p) => p.id === f.heroPath)?.name}</span>
            </Panel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary label="World"><img src={themeThumb(f.themeId)} alt="" className="mb-2 aspect-[3/2] w-full object-cover"/>{THEME_META[f.themeId].name}</Summary>
              <div className="grid gap-3">
                <Summary label="First habit" testId="text-onboarding-habit"><span dir="rtl">{f.habitTitle}</span><span className="block text-[11px] text-[color:var(--pq-mute)]">{f.habitTarget} {f.habitUnit} daily · {f.heroPath}{f.requiresPhotoProof ? ' · photo proof' : ''}</span></Summary>
                <Summary label="Locked reward" testId="text-onboarding-reward"><span dir="rtl">{f.rewardTitle}</span><span className="flex items-center gap-1 text-[11px] text-[color:var(--pq-mute)]"><Lock size={11}/> Level 2 + {f.rewardStreak}-day streak</span></Summary>
              </div>
            </div>
          </div>
          <div data-testid="status-starter-xp" className={cx('mt-6 flex items-center gap-4 border-2 border-dashed p-4', done ? 'border-[color:var(--pq-gold)] bg-[color:var(--pq-panel)]' : 'border-[color:var(--pq-line)]')}>
            <Sparkles className="text-[color:var(--pq-gold)]"/>
            <div><b className="pixel-title text-[13px] text-[color:var(--pq-gold)]">+{STARTER_XP} XP</b><p className="text-xs text-[color:var(--pq-mute)]">{done ? 'Starter XP awarded. Welcome to camp.' : 'Pending — awarded the moment you enter camp.'}</p></div>
          </div>
        </div>}
      </div>
    </main>

    <footer className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[color:var(--pq-line)] bg-[color:var(--pq-bg)]/95 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      {shownErr && <p role="alert" data-testid="status-onboarding-error" className="mx-auto max-w-5xl px-4 pt-3 text-xs text-[color:var(--pq-danger)]">{shownErr}</p>}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3">
        <Btn testId="button-onboarding-back" variant="quiet" disabled={f.step === 1 || locked} onClick={back}><ArrowLeft size={15}/> Back</Btn>
        <span data-testid="status-onboarding-save" className="hidden text-[11px] text-[color:var(--pq-mute)] sm:block">{saveState === 'saving' ? 'Saving draft…' : saveState === 'saved' ? 'Draft saved' : saveState === 'failed' ? 'Draft not saved — will retry' : ''}</span>
        {f.step < 5
          ? <Btn testId="button-onboarding-next" disabled={locked} onClick={() => void go(f.step + 1)}>{busy === 'next' ? 'Saving…' : 'Next'} <ArrowRight size={15}/></Btn>
          : <Btn testId="button-onboarding-finish" disabled={locked} onClick={() => void finish()}>{busy === 'finish' ? 'Entering…' : done ? 'Welcome!' : 'Enter Camp (ابدأ المغامرة)'}</Btn>}
      </div>
    </footer>
  </Frame>;
}

function Frame({ children }: { children: ReactNode }) { return <div className="scanlines min-h-[100dvh]">{children}</div>; }
function Summary({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return <div data-testid={testId} className="pixel-border bg-[color:var(--pq-panel)] p-4"><p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[color:var(--pq-cyan)]">{label}</p><div className="text-sm font-bold text-[color:var(--pq-ink)]">{children}</div></div>;
}
