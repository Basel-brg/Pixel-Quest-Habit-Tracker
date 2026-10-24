export type Schedule = { frequency: string; days: number[] };
export type HabitConfig = Schedule & { target: number; unit: string; mandatory: boolean; stat: "STR" | "INT" | "WIS"; active: boolean };
export type HabitMeta = { created: string; title: string; versions: { date: string; config: HabitConfig }[]; values: Record<string, number> };
export type Award = { xp: number; gold: number; stat?: "STR" | "INT" | "WIS"; active: boolean; date: string; title: string; kind: "habit" | "quest" | "onboarding"; legacy?: boolean };
export type Condition = { type: "level" | "streak" | "gold"; target: number; habitId?: number | null };
export type InventoryItem = { id: string; catalogId: string; name: string; description: string; quantity: number; equipped: boolean; requiredLevel: number; acquired: string };
export type Boss = { id: string; name: string; taskIds: number[]; hits: number[]; defeated: boolean; hp: number; maxHp: number; bonusGold: number; loot: string };
export type Journal = {
  version: 1; since: string; timezone: string; timezoneConfigured: boolean; timezoneChangedAt: string | null;
  lastSettled: string; hp: number; faintedUntil: string | null;
  habits: Record<string, HabitMeta>; quests: Record<string, { tags: string[]; type: "single" | "weekly" }>;
  rewards: Record<string, { conditions: Condition[]; claimCost: number; savingsTarget: number; savedAmount: number; savingsPerQuest: number }>;
  awards: Record<string, Award>; events: { date: string; at: string; xp: number; gold: number; kind: string; title: string }[];
  protections: Record<string, number[]>; inventory: InventoryItem[]; bosses: Boss[]; retiredBossIds: string[];
  chestEnabled: boolean; chests: Record<string, { outcome: string; at: string; habitIds: number[] }>;
  requests: Record<string, { fingerprint: string; message: string }>;
  settled: Record<string, { missed: number[]; damage: number; protected: number[] }>;
};
export const CATALOG = [
  { id: "boots", name: "Speed Boots", description: "Equip for +5% XP from 05:00–11:59 in your timezone. One pair; no stacking.", price: 100, requiredLevel: 1, consumable: false },
  { id: "shield", name: "Shield", description: "Equip to automatically absorb one missed mandatory habit penalty and protect that habit's streak.", price: 30, requiredLevel: 1, consumable: true },
  { id: "camping", name: "Camping Potion", description: "Use before midnight to protect today's active habits. No free completion or XP.", price: 40, requiredLevel: 1, consumable: true },
] as const;
export const CHEST_PRIZES = [
  { label: "10 Gold", probability: 0.5 },
  { label: "Coffee break", probability: 0.3 },
  { label: "Movie time", probability: 0.2 },
];
export const RULES = [
  "XP to next level = current level × 100. Avatars unlock at levels 1, 5, 10 and 20.",
  "Each missed mandatory scheduled habit costs 10 HP at local midnight. New mechanics and mandatory changes never penalize earlier days. Legacy habits start optional.",
  "Settlement happens on your next visit, including offline days, once per local date. Timezone changes are limited to once every 7 days after setup; a change never replays settled days.",
  "At 0 HP you faint: XP is halved for 6 hours, further damage is ignored while fainted, then HP recovers to 50. Offline recovery uses the actual elapsed time.",
  "Habits award 25 base XP and 10 Gold only at their full target. Streaks count completed scheduled days: off-days and protected days freeze, not increase, a streak. 3+ completions give ×1.2 XP; 7+ give ×1.5.",
  "Partial progress earns no XP. History before today is read-only. Clear today's progress before changing a habit's target, schedule or skill; settled history is preserved.",
  "Quest rewards: Easy 10 XP/5 Gold; Medium 25 XP/15 Gold; Hard 50 XP/35 Gold. The first completion fixes that quest's payout, including buffs, for any later undo/recompletion.",
  "An equipped Shield absorbs one missed-habit penalty automatically. Camping protects only today's active habits, must be used before midnight, and grants no completion or XP.",
  "Speed Boots add 5% morning XP (05:00–11:59 configured timezone), once, rounded down after all multipliers. Skills gain 1 point per completed habit and reverse on undo.",
  "Undo reverses the exact XP/Gold grant and requires enough unspent Gold. Completed tasks in defeated bosses and qualifying habits for a drawn chest cannot be reopened. Deletion keeps legitimately earned historical rewards; it never refunds purchases.",
  "Weekly bundles and overdue backlogs create stable bosses. Each eligible completed member task deals 25 HP. Defeat grants 40 bonus Gold and one rare Star Relic, once. Deleting any member retires an unfinished boss without a payout; deleting tasks is never a way to defeat it.",
  "All real-life reward conditions use AND. Gold eligibility is a balance check; only the separately shown claim cost is deducted. Old Gold-only rewards retain their original spend-on-claim meaning.",
  "Savings are manual/virtual estimates, not bank balances, real transfers or payments. Per-quest savings are recorded once on first completion; no money moves.",
  "Mystery chests are opt-in, free, no cash value and no purchases. Complete at least one scheduled habit and all today's scheduled habits to draw. Probabilities: 10 Gold 50%, Coffee break 30%, Movie time 20%. Once per local date and at least 24 hours since the previous draw. Already opened days cannot be farmed through undo or timezone changes.",
  "Weekly reports are Monday–Sunday in your timezone. Completion rates exclude off-days and protected days; earned XP/Gold are net grant/reversal history, not wallet balances. Migrated completion history is included; old Gold is estimated from the pre-RPG payout rules.",
  "Browser reminders are device/account-local, best-effort while this app is open. Closed browsers, sleeping devices and denied permissions cannot reliably notify. Native mobile notifications are a separate feature.",
];
export const AVATARS = [
  { id: "novice", name: "Novice", role: "Adventurer", description: "Your first adventure.", requiredLevel: 1 },
  { id: "squire", name: "Squire", role: "Woodland guard", description: "Light armor and a wooden sword.", requiredLevel: 5 },
  { id: "knight", name: "Knight", role: "Steel protector", description: "Steel armor, cape and shield.", requiredLevel: 10 },
  { id: "paladin", name: "Grandmaster", role: "Paladin", description: "Legendary armor, crown, wings and aura.", requiredLevel: 20 },
] as const;
export const XP = { easy: 10, medium: 25, hard: 50 };
export const GOLD = { easy: 5, medium: 15, hard: 35 };
export function localDay(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
export function validTimezone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function dayInstant(day: string, zone: string): Date {
  const desired = Date.parse(`${day}T00:00:00Z`);
  let t = desired;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
    const v = (key: string) => p.find(a => a.type === key)!.value;
    const represented = Date.parse(`${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}Z`);
    const diff = desired - represented; t += diff; if (!diff) break;
  }
  return new Date(t);
}
export function scheduled(config: Schedule, day: string) {
  return config.frequency === "daily" || config.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}
export function configOn(meta: HabitMeta, day: string) {
  return [...meta.versions].reverse().find(v => v.date <= day)?.config;
}
export function dayStatus(meta: HabitMeta, day: string, today: string, protectedIds: number[], habitId: number) {
  const c = configOn(meta, day);
  if (!c || day < meta.created) return "off" as const;
  const value = meta.values[day] ?? 0;
  if (value >= c.target) return "complete" as const;
  if (!c.active || !scheduled(c, day)) return "off" as const;
  if (protectedIds.includes(habitId)) return "protected" as const;
  if (value > 0) return "partial" as const;
  return day >= today ? "upcoming" as const : "missed" as const;
}
export function streaks(meta: HabitMeta, today: string, protections: Journal["protections"], id: number) {
  let run = 0, best = 0, current = 0;
  for (let day = meta.created; day <= today; day = addDays(day, 1)) {
    const status = dayStatus(meta, day, today, protections[day] ?? [], id);
    if (status === "off" || status === "protected") continue;
    if (status === "complete") { run++; best = Math.max(best, run); }
    else if (day !== today) run = 0;
    current = run;
  }
  return { current: Math.max(current, run), best };
}
export function levelForXp(xp: number) {
  let level = 1, remaining = Math.max(0, xp);
  while (remaining >= level * 100) { remaining -= level * 100; level++; }
  return { level, xpIntoLevel: remaining, xpToNextLevel: level * 100 };
}
export function xpAmount(base: number, streak: number, journal: Journal, now: Date) {
  const h = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: journal.timezone }).format(now));
  const boots = journal.inventory.some(i => i.catalogId === "boots" && i.equipped && i.quantity > 0);
  return Math.floor(base * (streak >= 7 ? 1.5 : streak >= 3 ? 1.2 : 1) * (boots && h >= 5 && h < 12 ? 1.05 : 1) * (journal.faintedUntil && new Date(journal.faintedUntil) > now ? 0.5 : 1));
}
