import type { OnboardingDraft, OnboardingDraftHabitPresetId, OnboardingDraftRewardPresetId, RpgSnapshot } from '@workspace/api-client-react';
import { isTheme, type ThemeId } from '@/lib/theme';

export type HeroPath = 'STR' | 'INT' | 'WIS';
export type HabitPresetId = OnboardingDraftHabitPresetId;
export type RewardPresetId = OnboardingDraftRewardPresetId;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const STARTER_XP = 50;

export const PATHS: { id: HeroPath; name: string; ar: string; focus: string; stat: string }[] = [
  { id: 'STR', name: 'Warrior Path', ar: 'المحارب', focus: 'Physical health & fitness', stat: 'Strength' },
  { id: 'INT', name: 'Mage / Scholar Path', ar: 'الحكيم', focus: 'Study, tech & learning', stat: 'Intelligence' },
  { id: 'WIS', name: 'Monk Path', ar: 'الراهب', focus: 'Discipline, mental calm & productivity', stat: 'Wisdom' },
];

export const HABIT_PRESETS: Record<HeroPath, { id: Exclude<HabitPresetId, 'custom'>; title: string; target: number; unit: string }[]> = {
  STR: [
    { id: 'water', title: '💧 شرب 2.5 لتر ماء', target: 2.5, unit: 'لتر' },
    { id: 'workout', title: '🏋️‍♂️ تمرين 30 دقيقة', target: 30, unit: 'دقيقة' },
  ],
  INT: [
    { id: 'read', title: '📖 قراءة 15 صفحة', target: 15, unit: 'صفحة' },
    { id: 'study', title: '💻 جلسة برمجة/دراسة 45 دقيقة', target: 45, unit: 'دقيقة' },
  ],
  WIS: [
    { id: 'meditate', title: '🧘‍♂️ تأمل 10 دقائق', target: 10, unit: 'دقائق' },
    { id: 'sleep', title: '🛏️ نوم منتظم', target: 1, unit: 'ليلة' },
  ],
};

/** Coffee and meal gates are fixed; only the item preset lets the hero choose a streak (0 = Level 2 only). */
export const REWARD_PRESETS: { id: RewardPresetId; title: string; streak: number; fixed: boolean }[] = [
  { id: 'coffee', title: '☕ قهوة مميزة من كافيه مفضل', streak: 3, fixed: true },
  { id: 'meal', title: '🍕 وجبة مفتوحة في نهاية الأسبوع', streak: 5, fixed: true },
  { id: 'item', title: '🎧 غرض واقعي تود شراءه (سماعات/ملابس)', streak: 0, fixed: false },
];
export const gateText = (streak: string | number) => { const n = Number(streak); return n > 0 ? `Level 2 AND a ${n}-day streak` : 'Level 2 only'; };

/** Editable form state; numeric fields stay strings while typing. */
export interface DraftForm {
  step: number; username: string; themeId: ThemeId; heroPath: HeroPath | null;
  habitPresetId: HabitPresetId | null; habitTitle: string; habitTarget: string; habitUnit: string; requiresPhotoProof: boolean;
  rewardPresetId: RewardPresetId | null; rewardTitle: string; rewardStreak: string;
}
const isPath = (v: unknown): v is HeroPath => v === 'STR' || v === 'INT' || v === 'WIS';
const HABIT_IDS = ['water', 'workout', 'read', 'study', 'meditate', 'sleep', 'custom'];
const REWARD_IDS = ['coffee', 'meal', 'item'];
const clampStep = (n: unknown) => (typeof n === 'number' && n >= 1 && n <= 5 ? Math.floor(n) : 1);
export const revisionOf = (s: RpgSnapshot | undefined | null) => (typeof s?.profile.onboardingRevision === 'number' ? s.profile.onboardingRevision : 0);

/** Theme authority: the account's selectedTheme wins over any stale draft value. */
export function formFromServer(d: Partial<OnboardingDraft> | undefined, profile: { username?: string; selectedTheme?: string; heroPath?: string | null }): DraftForm {
  const u = d?.username ?? profile.username ?? '';
  const heroPath = isPath(d?.heroPath) ? d!.heroPath as HeroPath : isPath(profile.heroPath) ? profile.heroPath : null;
  const hp = HABIT_IDS.includes(d?.habitPresetId ?? '') ? d!.habitPresetId as HabitPresetId : null;
  const rp = REWARD_IDS.includes(d?.rewardPresetId ?? '') ? d!.rewardPresetId as RewardPresetId : null;
  const fixed = REWARD_PRESETS.find((r) => r.id === rp && r.fixed);
  return {
    step: clampStep(d?.step),
    username: u.slice(0, 20),
    themeId: isTheme(profile.selectedTheme) ? profile.selectedTheme : isTheme(d?.themeId) ? d!.themeId as ThemeId : 'retro',
    heroPath,
    habitPresetId: hp && hp !== 'custom' && heroPath && !HABIT_PRESETS[heroPath].some((h) => h.id === hp) ? null : hp,
    habitTitle: d?.habitTitle ?? '', habitTarget: d?.habitTarget != null ? String(d.habitTarget) : '1', habitUnit: d?.habitUnit ?? '',
    requiresPhotoProof: d?.requiresPhotoProof ?? false,
    rewardPresetId: rp, rewardTitle: d?.rewardTitle ?? '',
    rewardStreak: fixed ? String(fixed.streak) : d?.rewardStreak != null ? String(d.rewardStreak) : '0',
  };
}

export const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
export const targetOk = (s: string) => { const n = num(s); return n >= 1 && n <= 1_000_000; };
export const streakOk = (s: string) => { const n = num(s); return s.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 3650; };

/** Path change: drop a preset that belongs to another path (and its preset-filled fields). */
export function withPath(f: DraftForm, path: HeroPath): Partial<DraftForm> {
  const keep = !f.habitPresetId || f.habitPresetId === 'custom' || HABIT_PRESETS[path].some((h) => h.id === f.habitPresetId);
  return keep ? { heroPath: path } : { heroPath: path, habitPresetId: null, habitTitle: '', habitTarget: '1', habitUnit: '' };
}
export function withReward(id: RewardPresetId, f: DraftForm): Partial<DraftForm> {
  const r = REWARD_PRESETS.find((x) => x.id === id)!;
  const prevPreset = REWARD_PRESETS.find((x) => x.id === f.rewardPresetId);
  const titleIsPreset = !f.rewardTitle.trim() || f.rewardTitle === prevPreset?.title;
  return { rewardPresetId: id, rewardTitle: titleIsPreset ? r.title : f.rewardTitle, rewardStreak: r.fixed ? String(r.streak) : f.rewardPresetId === 'item' ? f.rewardStreak : '0' };
}

export function stepError(f: DraftForm, step: number): string {
  if (step === 1) return USERNAME_RE.test(f.username.trim()) ? '' : 'Hero name: 3–20 letters, numbers or _ (ASCII).';
  if (step === 2) return f.heroPath ? '' : 'Choose a hero path to continue.';
  if (step === 3) return !f.habitPresetId || !f.habitTitle.trim() ? 'Pick a preset or name your own habit.' : !targetOk(f.habitTarget) ? 'Daily target must be between 1 and 1,000,000.' : '';
  if (step === 4) return !f.rewardPresetId || !f.rewardTitle.trim() ? 'Pick one of the three rewards.' : !streakOk(f.rewardStreak) ? 'Streak must be a whole number of days (0–3650).' : '';
  return '';
}
/** Highest step whose server prerequisites hold — autosave never claims a step it can't back up. */
export function safeStep(f: DraftForm, want = f.step) {
  let s = 1;
  while (s < want && !stepError(f, s)) s++;
  return s;
}

/** Full replacement draft: every currently-valid field is sent; blank fields are omitted (= cleared). */
export function toPayload(f: DraftForm, step = f.step): OnboardingDraft {
  const p: OnboardingDraft = { step, themeId: f.themeId, requiresPhotoProof: f.requiresPhotoProof };
  const u = f.username.trim(); if (USERNAME_RE.test(u)) p.username = u;
  if (f.heroPath) p.heroPath = f.heroPath;
  if (f.habitPresetId) p.habitPresetId = f.habitPresetId;
  const ht = f.habitTitle.trim(); if (ht) p.habitTitle = ht.slice(0, 120);
  if (targetOk(f.habitTarget)) p.habitTarget = num(f.habitTarget);
  const hu = f.habitUnit.trim(); if (hu) p.habitUnit = hu.slice(0, 30);
  if (f.rewardPresetId) p.rewardPresetId = f.rewardPresetId;
  const rt = f.rewardTitle.trim(); if (rt) p.rewardTitle = rt.slice(0, 120);
  if (streakOk(f.rewardStreak)) p.rewardStreak = num(f.rewardStreak);
  return p;
}
export const sameDraft = (a: DraftForm, b: DraftForm) => JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));

export function errInfo(e: unknown): { status?: number; message: string } {
  const x = e as { status?: number; data?: { error?: string; message?: string } | null; message?: string };
  return { status: x?.status, message: x?.data?.error || x?.data?.message || x?.message || 'Could not reach camp. Check your connection.' };
}
