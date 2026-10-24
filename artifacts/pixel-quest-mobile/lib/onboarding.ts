import type { OnboardingDraft } from '@workspace/api-client-react';
import { isThemeId as isTheme, type ThemeId } from '@/constants/themes';

export type HeroPath = 'STR' | 'INT' | 'WIS';
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const STARTER_XP = 50;

export const PATHS: { id: HeroPath; name: string; ar: string; focus: string; stat: string }[] = [
  { id: 'STR', name: 'Warrior Path', ar: 'المحارب', focus: 'Physical health & fitness', stat: 'Strength' },
  { id: 'INT', name: 'Mage / Scholar Path', ar: 'الحكيم', focus: 'Study, tech & learning', stat: 'Intelligence' },
  { id: 'WIS', name: 'Monk Path', ar: 'الراهب', focus: 'Discipline, mental calm & productivity', stat: 'Wisdom' },
];

export const HABIT_PRESETS: Record<HeroPath, { id: string; title: string; target: number; unit: string }[]> = {
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

export const REWARD_PRESETS: { id: string; title: string; streak: number; hint: string }[] = [
  { id: 'coffee', title: '☕ قهوة مميزة من كافيه مفضل', streak: 3, hint: 'Level 2 & 3-day streak' },
  { id: 'meal', title: '🍕 وجبة مفتوحة في نهاية الأسبوع', streak: 5, hint: 'Level 2 & 5-day streak' },
  { id: 'item', title: '🎧 غرض واقعي تود شراءه (سماعات/ملابس)', streak: 7, hint: 'Level 2 & your chosen streak — rename it' },
];

/** Editable form state; numeric fields stay strings while typing. */
export interface DraftForm {
  step: number; username: string; themeId: ThemeId; heroPath: HeroPath | null;
  habitTitle: string; habitTarget: string; habitUnit: string; requiresPhotoProof: boolean;
  rewardTitle: string; rewardStreak: string;
}
const isPath = (v: unknown): v is HeroPath => v === 'STR' || v === 'INT' || v === 'WIS';
const clampStep = (n: unknown) => (typeof n === 'number' && n >= 1 && n <= 5 ? Math.floor(n) : 1);

export function formFromServer(d: Partial<OnboardingDraft> | undefined, profile: { username?: string; selectedTheme?: string; heroPath?: string | null }): DraftForm {
  const u = d?.username ?? profile.username ?? '';
  return {
    step: clampStep(d?.step),
    username: u.slice(0, 20),
    themeId: isTheme(d?.themeId) ? d!.themeId as ThemeId : isTheme(profile.selectedTheme) ? profile.selectedTheme : 'retro',
    heroPath: isPath(d?.heroPath) ? d!.heroPath as HeroPath : isPath(profile.heroPath) ? profile.heroPath : null,
    habitTitle: d?.habitTitle ?? '', habitTarget: d?.habitTarget != null ? String(d.habitTarget) : '1', habitUnit: d?.habitUnit ?? '',
    requiresPhotoProof: d?.requiresPhotoProof ?? false,
    rewardTitle: d?.rewardTitle ?? '', rewardStreak: d?.rewardStreak != null ? String(d.rewardStreak) : '3',
  };
}

export const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
export const targetOk = (s: string) => { const n = num(s); return n >= 1 && n <= 1_000_000; };
export const streakOk = (s: string) => { const n = num(s); return Number.isInteger(n) && n >= 1 && n <= 3650; };

/** Only valid fields are sent; the server merges partial drafts. */
export function toPayload(f: DraftForm, step = f.step): OnboardingDraft {
  const p: OnboardingDraft = { step, themeId: f.themeId, requiresPhotoProof: f.requiresPhotoProof };
  const u = f.username.trim(); if (u) p.username = u.slice(0, 20);
  if (f.heroPath) p.heroPath = f.heroPath;
  const ht = f.habitTitle.trim(); if (ht) p.habitTitle = ht.slice(0, 120);
  if (targetOk(f.habitTarget)) p.habitTarget = num(f.habitTarget);
  const hu = f.habitUnit.trim(); if (hu) p.habitUnit = hu.slice(0, 30);
  const rt = f.rewardTitle.trim(); if (rt) p.rewardTitle = rt.slice(0, 120);
  if (streakOk(f.rewardStreak)) p.rewardStreak = num(f.rewardStreak);
  return p;
}

export function stepError(f: DraftForm, step: number): string {
  if (step === 1) return USERNAME_RE.test(f.username.trim()) ? '' : 'Hero name: 3–20 letters, numbers or _ (ASCII).';
  if (step === 2) return f.heroPath ? '' : 'Choose a hero path to continue.';
  if (step === 3) return !f.habitTitle.trim() ? 'Pick a preset or name your first habit.' : !targetOk(f.habitTarget) ? 'Daily target must be between 1 and 1,000,000.' : '';
  if (step === 4) return !f.rewardTitle.trim() ? 'Pick or name a real-life reward.' : !streakOk(f.rewardStreak) ? 'Streak must be a whole number of days (1–3650).' : '';
  return '';
}
