import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, habitsTable, habitCompletionsTable, questTasksTable, rewardsTable, pixelQuestUsersTable, playerProfileTable, playerMilestonesTable, pixelRpgStateTable } from "@workspace/db";
import { PerformRpgActionBody, GetRpgStateResponse } from "@workspace/api-zod";
import { addDays, localDay, dayInstant, configOn, scheduled, dayStatus, streaks, levelForXp, xpAmount, validTimezone, AVATARS, CATALOG, CHEST_PRIZES, RULES, XP, GOLD, type Journal, type HabitConfig, type Condition, type Award } from "./rpg-rules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Habit = typeof habitsTable.$inferSelect;
type Quest = typeof questTasksTable.$inferSelect;
type Reward = typeof rewardsTable.$inferSelect;
export type Action = ReturnType<typeof PerformRpgActionBody.parse>;
export class GameError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function fail(message: string, status = 409): never { throw new GameError(status, message); }
function own<T extends { id: number }>(rows: T[], id?: number): T {
  return rows.find(r => r.id === id) ?? fail("Owned record not found.", 404);
}
const skill = (category: string): "STR" | "INT" | "WIS" => /fitness|health|sleep|exercise|sport|wellbeing/i.test(category) ? "STR" : /reading|coding|study|learning|education/i.test(category) ? "INT" : "WIS";
const titleOf = (a: Action) => a.title?.trim() || fail("A non-empty title is required.", 400);
const dateOnly = (v: string | Date) => typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
function validateDate(day: string) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day; }

class Game {
  today: string;
  message = "";
  effect: "none" | "complete" | "boss" | "reward" = "none";
  constructor(
    public tx: Tx, public uid: string, public now: Date, public j: Journal,
    public habits: Habit[], public quests: Quest[], public rewards: Reward[],
    public user: typeof pixelQuestUsersTable.$inferSelect,
    public player: typeof playerProfileTable.$inferSelect,
  ) { this.today = localDay(now, j.timezone); }
  event(kind: string, title: string, xp = 0, gold = 0, date = this.today, at = this.now.toISOString()) {
    this.j.events.push({ date, at, kind, title, xp, gold });
  }
  recover(at: Date) {
    if (this.j.faintedUntil && new Date(this.j.faintedUntil) <= at) {
      this.j.hp = 50; this.j.faintedUntil = null;
    }
  }
  settle() {
    // All days strictly advance. No scheduler or client clock is trusted.
    for (let day = addDays(this.j.lastSettled, 1); day < this.today; day = addDays(day, 1)) {
      const at = dayInstant(addDays(day, 1), this.j.timezone);
      this.recover(at);
      const missed: number[] = [], protectedIds: number[] = [];
      let damage = 0;
      for (const [key, meta] of Object.entries(this.j.habits)) {
        const id = Number(key), config = configOn(meta, day);
        if (!config?.active || !config.mandatory || day < addDays(this.j.since, 1) || !scheduled(config, day) || day < meta.created) continue;
        if ((meta.values[day] ?? 0) >= config.target) continue;
        if (this.j.protections[day]?.includes(id)) { protectedIds.push(id); continue; }
        const shield = this.j.inventory.find(i => i.catalogId === "shield" && i.equipped && i.quantity > 0);
        if (shield) {
          shield.quantity--; if (!shield.quantity) shield.equipped = false;
          this.j.protections[day] = [...new Set([...(this.j.protections[day] ?? []), id])];
          protectedIds.push(id); this.event("shield", "Shield absorbed a missed habit", 0, 0, day, at.toISOString()); continue;
        }
        missed.push(id);
        if (!this.j.faintedUntil) {
          const lost = Math.min(10, this.j.hp); this.j.hp -= lost; damage += lost;
          if (this.j.hp === 0) this.j.faintedUntil = new Date(at.getTime() + 6 * 3600000).toISOString();
        }
      }
      this.j.settled[day] = { missed, damage, protected: protectedIds };
      this.j.lastSettled = day;
    }
    this.recover(this.now);
  }
  habitView(h: Habit) {
    const meta = this.j.habits[h.id], c = configOn(meta, this.today)!;
    const run = streaks(meta, this.today, this.j.protections, h.id);
    return {
      ...h, createdAt: h.createdAt.toISOString(), completedDates: Object.keys(meta.values).filter(d => meta.values[d] >= (configOn(meta, d)?.target ?? 1)),
      mandatory: c.mandatory, target: c.target, unit: c.unit, stat: c.stat, progress: meta.values[this.today] ?? 0,
      streak: run.current, bestStreak: run.best, scheduledToday: c.active && scheduled(c, this.today),
      history: Array.from({ length: 30 }, (_, i) => {
        const day = addDays(this.today, i - 29);
        return { date: day, status: dayStatus(meta, day, this.today, this.j.protections[day] ?? [], h.id), value: meta.values[day] ?? 0, target: configOn(meta, day)?.target ?? c.target };
      }),
    };
  }
  questView(q: Quest) {
    return { ...q, createdAt: q.createdAt.toISOString(), completedAt: q.completedAt?.toISOString() ?? null, ...this.j.quests[q.id], xpReward: XP[q.difficulty as keyof typeof XP], goldReward: GOLD[q.difficulty as keyof typeof GOLD] };
  }
  conditionView(c: Condition) {
    let current = 0, label = "";
    if (c.type === "gold") { current = this.player.gold; label = "Gold balance (eligibility)"; }
    if (c.type === "level") { current = levelForXp(this.player.xp).level; label = "Player level"; }
    if (c.type === "streak") {
      const meta = c.habitId ? this.j.habits[c.habitId] : undefined;
      const habit = this.habits.find(h => h.id === c.habitId);
      current = meta && habit && !habit.archived ? streaks(meta, this.today, this.j.protections, c.habitId!).current : 0;
      label = `${habit?.title ?? "Unavailable habit"} streak`;
    }
    return { ...c, current, label, met: current >= c.target };
  }
  rewardView(r: Reward) {
    const m = this.j.rewards[r.id], conditions = m.conditions.map(c => this.conditionView(c));
    const ready = conditions.every(c => c.met) && this.player.gold >= m.claimCost;
    const first = conditions[0];
    return {
      ...r, createdAt: r.createdAt.toISOString(), claimedAt: r.claimedAt?.toISOString() ?? null,
      habitTitle: this.habits.find(h => h.id === r.habitId)?.title ?? null,
      status: r.claimedAt ? "claimed" : ready ? "ready" : "locked",
      currentValue: r.claimedAt ? r.target : Math.min(first.current, first.target),
      progressText: r.claimedAt ? "CLAIMED" : ready ? "UNLOCKED - CLAIM IN REAL LIFE" : conditions.map(c => `${c.label}: ${c.current}/${c.target}`).join(" AND "),
      ...m, conditions,
    };
  }
  week(start: string, end: string) {
    const habits = Object.entries(this.j.habits).map(([key, meta]) => {
      let opportunities = 0, completed = 0;
      for (let day = start; day <= end && day <= this.today; day = addDays(day, 1)) {
        const status = dayStatus(meta, day, this.today, this.j.protections[day] ?? [], Number(key));
        if (status === "off" || status === "protected") continue;
        opportunities++; if (status === "complete") completed++;
      }
      return { id: Number(key), title: meta.title, completed, opportunities, rate: opportunities ? completed / opportunities : 0 };
    }).filter(h => h.opportunities > 0);
    const completed = habits.reduce((n, h) => n + h.completed, 0), opportunities = habits.reduce((n, h) => n + h.opportunities, 0);
    const events = this.j.events.filter(e => e.date >= start && e.date <= end);
    return { start, end, completed, opportunities, completionRate: opportunities ? completed / opportunities : 0, xp: events.reduce((n, e) => n + e.xp, 0), gold: events.reduce((n, e) => n + e.gold, 0), habits: habits.sort((a, b) => b.rate - a.rate) };
  }
  async bosses() {
    const weekday = new Date(`${this.today}T12:00:00Z`).getUTCDay();
    const monday = addDays(this.today, -((weekday + 6) % 7));
    for (const type of ["overdue", "weekly"]) {
      const id = `${type}-${monday}`;
      if (this.j.bosses.some(b => b.id === id) || this.j.retiredBossIds.includes(id)) continue;
      const members = this.quests.filter(q => q.status === "active" && (type === "overdue" ? q.dueDate && q.dueDate < this.today : this.j.quests[q.id]?.type === "weekly") && !this.j.bosses.some(b => !b.defeated && b.taskIds.includes(q.id)));
      if (!members.length) continue;
      this.j.bosses.push({ id, name: type === "overdue" ? "Backlog Wraith" : "Weekly Iron Golem", taskIds: members.map(q => q.id), hits: [], defeated: false, hp: members.length * 25, maxHp: members.length * 25, bonusGold: 40, loot: "Star Relic" });
    }
    for (const b of this.j.bosses.filter(b => !b.defeated)) {
      b.hits = b.taskIds.filter(id => this.quests.some(q => q.id === id && q.status === "completed"));
      b.hp = Math.max(0, b.maxHp - b.hits.length * 25);
      if (b.hp === 0 && b.taskIds.length) {
        b.defeated = true; this.player.gold += b.bonusGold;
        this.j.inventory.push({ id: randomUUID(), catalogId: "relic", name: "Star Relic", description: "Rare trophy earned by defeating a boss. Cosmetic only; no stacking or cash value.", quantity: 1, equipped: false, requiredLevel: 1, acquired: this.today });
        this.event("boss", b.name, 0, b.bonusGold); this.effect = "boss"; this.message = `${b.name} defeated! +40 Gold and a Star Relic.`;
      }
    }
  }
  chestEligible() {
    const scheduledHabits = this.habits.filter(h => !h.archived && this.habitView(h).scheduledToday);
    const latest = Object.values(this.j.chests).reduce((n, c) => Math.max(n, Date.parse(c.at)), 0);
    return this.j.chestEnabled && scheduledHabits.length > 0 && scheduledHabits.every(h => {
      const m = this.j.habits[h.id]; return (m.values[this.today] ?? 0) >= configOn(m, this.today)!.target;
    }) && !this.j.chests[this.today] && this.now.getTime() - latest >= 24 * 3600000;
  }
  async snapshot() {
    const level = levelForXp(this.player.xp).level;
    const habitStreaks = this.habits.map(h => { const s = streaks(this.j.habits[h.id], this.today, this.j.protections, h.id); return { habitId: h.id, habitTitle: h.title, currentStreak: s.current, highestStreak: s.best }; });
    const milestones = await this.tx.select().from(playerMilestonesTable).where(eq(playerMilestonesTable.userId, this.uid)).orderBy(desc(playerMilestonesTable.achievedAt));
    const profile = { username: this.user.username, avatarId: this.user.selectedAvatar, xp: this.player.xp, gold: this.player.gold, level, lifetimeTasksVanquished: this.player.lifetimeTasksVanquished, highestHabitStreak: Math.max(0, ...habitStreaks.map(h => h.highestStreak)), habitStreaks, avatars: AVATARS.map(a => ({ ...a, unlocked: level >= a.requiredLevel })), milestones: milestones.map(m => ({ id: m.key, title: m.title, description: m.description, achievedAt: m.achievedAt.toISOString() })) };
    const skills = { STR: 0, INT: 0, WIS: 0 };
    for (const a of Object.values(this.j.awards)) if (a.active && a.stat) skills[a.stat]++;
    const dayOfWeek = new Date(`${this.today}T12:00:00Z`).getUTCDay(), monday = addDays(this.today, -((dayOfWeek + 6) % 7));
    return GetRpgStateResponse.parse({
      today: this.today, timezone: this.j.timezone, hp: this.j.hp, faintedUntil: this.j.faintedUntil,
      campingToday: (this.j.protections[this.today]?.length ?? 0) > 0, stateSince: this.j.since, profile, skills,
      habits: this.habits.map(h => this.habitView(h)), quests: this.quests.map(q => this.questView(q)),
      rewards: this.rewards.map(r => this.rewardView(r)), inventory: this.j.inventory.filter(i => i.quantity > 0), merchant: CATALOG, bosses: this.j.bosses,
      currentWeek: this.week(monday, addDays(monday, 6)), previousWeek: this.week(addDays(monday, -7), addDays(monday, -1)),
      chest: { enabled: this.j.chestEnabled, eligible: this.chestEligible(), opened: !!this.j.chests[this.today], outcome: this.j.chests[this.today]?.outcome ?? null, rewards: CHEST_PRIZES, history: Object.entries(this.j.chests).sort(([a], [b]) => b.localeCompare(a)).map(([date, c]) => ({ date, outcome: c.outcome })) },
      rules: RULES, message: this.message, effect: this.effect,
    });
  }
  async grant(key: string, proposed: Omit<Award, "active">) {
    let a = this.j.awards[key];
    if (a?.active) return;
    if (!a) { a = { ...proposed, active: false }; this.j.awards[key] = a; }
    a.active = true; this.player.xp += a.xp; this.player.gold += a.gold;
    this.event(a.kind, a.title, a.xp, a.gold);
    this.effect = "complete";
  }
  undo(key: string) {
    const a = this.j.awards[key]; if (!a?.active) return;
    if (this.player.gold < a.gold) fail(`Undo needs ${a.gold} unspent Gold to reverse the original reward. Your Gold has already been spent.`);
    a.active = false; this.player.xp = Math.max(0, this.player.xp - a.xp); this.player.gold -= a.gold;
    this.event("undo", a.title, -a.xp, -a.gold);
  }
  async action(a: Action) {
    switch (a.action) {
      case "saveHabit": {
        const previous = a.id ? own(this.habits, a.id) : undefined;
        const old = previous ? configOn(this.j.habits[previous.id], this.today)! : undefined;
        const frequency = a.frequency ?? previous?.frequency ?? "daily", days = a.days ?? previous?.days ?? [];
        if (frequency === "weekly" && !days.length) fail("Choose at least one active weekday.", 400);
        const c: HabitConfig = { frequency, days: [...new Set(days)], active: !(a.archived ?? previous?.archived ?? false), target: a.target ?? old?.target ?? 1, unit: a.unit?.trim() ?? old?.unit ?? "completion", mandatory: a.mandatory ?? old?.mandatory ?? false, stat: a.stat ?? old?.stat ?? skill(a.category ?? "Wellbeing") };
        if (old && (this.j.habits[previous!.id].values[this.today] ?? 0) > 0 && ["target", "frequency", "days", "stat", "mandatory"].some(k => JSON.stringify(old[k as keyof HabitConfig]) !== JSON.stringify(c[k as keyof HabitConfig]))) fail("Clear today's progress before changing target, schedule, mandatory status or skill.");
        const data = { title: a.title !== undefined ? titleOf(a) : previous?.title ?? fail("Title required.", 400), category: a.category?.trim() || previous?.category || "Wellbeing", frequency, days, archived: !c.active };
        if (previous) {
          const [updated] = await this.tx.update(habitsTable).set(data).where(and(eq(habitsTable.id, previous.id), eq(habitsTable.userId, this.uid))).returning();
          this.habits = this.habits.map(h => h.id === updated.id ? updated : h);
          const m = this.j.habits[updated.id]; m.title = updated.title;
          m.versions = m.versions.filter(v => v.date !== this.today); m.versions.push({ date: this.today, config: c });
        } else {
          const [h] = await this.tx.insert(habitsTable).values({ ...data, userId: this.uid, createdAt: this.now }).returning();
          this.habits.unshift(h); this.j.habits[h.id] = { created: this.today, title: h.title, versions: [{ date: this.today, config: c }], values: {} };
        }
        this.message = "Habit saved."; break;
      }
      case "deleteHabit": {
        const h = own(this.habits, a.id), m = this.j.habits[h.id], c = configOn(m, this.today)!;
        m.versions.push({ date: this.today, config: { ...c, active: false } });
        await this.tx.delete(habitsTable).where(and(eq(habitsTable.id, h.id), eq(habitsTable.userId, this.uid)));
        this.habits = this.habits.filter(x => x.id !== h.id); this.message = "Habit deleted; earned history retained."; break;
      }
      case "progressHabit": {
        const h = own(this.habits, a.id), m = this.j.habits[h.id], c = configOn(m, this.today)!;
        const day = a.date ?? this.today;
        if (day !== this.today) fail("Settled history is read-only. Record progress for your current local day.");
        if (!c.active || !scheduled(c, day)) fail("This habit is not scheduled today.");
        const value = Math.min(a.value ?? c.target, c.target);
        if (value < c.target && this.j.chests[day]?.habitIds.includes(h.id)) fail("This completion qualified a drawn chest and cannot be reopened.");
        const key = `habit-${h.id}-${day}`;
        if (value < c.target) {
          this.undo(key);
          await this.tx.delete(habitCompletionsTable).where(and(eq(habitCompletionsTable.userId, this.uid), eq(habitCompletionsTable.habitId, h.id), eq(habitCompletionsTable.date, day)));
          m.values[day] = value;
        } else {
          m.values[day] = value;
          const streak = streaks(m, this.today, this.j.protections, h.id).current;
          await this.grant(key, { xp: xpAmount(25, streak, this.j, this.now), gold: 10, stat: c.stat, title: h.title, date: day, kind: "habit" });
          await this.tx.insert(habitCompletionsTable).values({ userId: this.uid, habitId: h.id, date: day, xpAwarded: this.j.awards[key].xp, completedAt: this.now }).onConflictDoNothing();
          for (const n of [3, 7, 14, 30]) if (streak >= n) await this.tx.insert(playerMilestonesTable).values({ userId: this.uid, key: `habit-${h.id}-streak-${n}`, title: `${n}-day streak`, description: `${h.title}: ${n} scheduled completions.`, achievedAt: this.now }).onConflictDoNothing();
        }
        this.message = value >= c.target ? "Habit complete!" : "Progress saved."; break;
      }
      case "saveQuest": {
        const q = a.id ? own(this.quests, a.id) : undefined;
        if (a.dueDate && !validateDate(a.dueDate)) fail("Use a valid YYYY-MM-DD due date.", 400);
        const data = { title: a.title !== undefined ? titleOf(a) : q?.title ?? fail("Title required.", 400), category: a.category?.trim() || q?.category || "Personal", difficulty: a.difficulty ?? q?.difficulty ?? "medium", priority: a.priority ?? q?.priority ?? false, dueDate: a.dueDate !== undefined ? a.dueDate : q?.dueDate ?? null };
        const [saved] = q ? await this.tx.update(questTasksTable).set(data).where(and(eq(questTasksTable.id, q.id), eq(questTasksTable.userId, this.uid))).returning() : await this.tx.insert(questTasksTable).values({ ...data, userId: this.uid, createdAt: this.now }).returning();
        this.quests = [saved, ...this.quests.filter(x => x.id !== saved.id)];
        this.j.quests[saved.id] = { tags: a.tags ?? this.j.quests[saved.id]?.tags ?? [], type: a.type ?? this.j.quests[saved.id]?.type ?? "single" };
        this.message = "Quest saved."; break;
      }
      case "deleteQuest": {
        const q = own(this.quests, a.id);
        const retired = this.j.bosses.filter(b => !b.defeated && b.taskIds.includes(q.id));
        this.j.retiredBossIds.push(...retired.map(b => b.id));
        this.j.bosses = this.j.bosses.filter(b => !retired.includes(b));
        await this.tx.delete(questTasksTable).where(and(eq(questTasksTable.id, q.id), eq(questTasksTable.userId, this.uid)));
        this.quests = this.quests.filter(x => x.id !== q.id); this.message = "Quest deleted; earned history retained."; break;
      }
      case "completeQuest": {
        const q = own(this.quests, a.id), completed = a.completed ?? true, key = `quest-${q.id}`;
        if ((q.status === "completed") === completed) break;
        if (!completed && this.j.bosses.some(b => b.defeated && b.taskIds.includes(q.id))) fail("This quest defeated a boss and cannot be reopened.");
        const first = !this.j.awards[key];
        if (completed) {
          await this.grant(key, { xp: xpAmount(XP[q.difficulty as keyof typeof XP], 0, this.j, this.now), gold: GOLD[q.difficulty as keyof typeof GOLD], date: this.today, title: q.title, kind: "quest" });
          this.player.lifetimeTasksVanquished++;
          if (first) for (const row of this.rewards.filter(r => !r.claimedAt)) {
            const r = this.j.rewards[row.id];
            if (r.savingsTarget > 0) r.savedAmount = Math.min(r.savingsTarget, r.savedAmount + r.savingsPerQuest);
          }
        } else { this.undo(key); this.player.lifetimeTasksVanquished = Math.max(0, this.player.lifetimeTasksVanquished - 1); }
        const [updated] = await this.tx.update(questTasksTable).set({ status: completed ? "completed" : "active", completedAt: completed ? this.now : null, xpAwarded: completed ? this.j.awards[key].xp : 0 }).where(and(eq(questTasksTable.id, q.id), eq(questTasksTable.userId, this.uid))).returning();
        this.quests = this.quests.map(x => x.id === q.id ? updated : x); this.message = completed ? "Quest vanquished!" : "Quest reopened."; break;
      }
      case "saveReward": {
        const r = a.id ? own(this.rewards, a.id) : undefined;
        if (r?.claimedAt) fail("Claimed trophies are immutable.");
        const old = r ? this.j.rewards[r.id] : undefined;
        const conditions = a.conditions?.map(c => ({ type: c.type, target: c.target, habitId: c.type === "streak" ? c.habitId : null })) ?? old?.conditions ?? fail("At least one requirement is required.", 400);
        if (new Set(conditions.map(c => c.type)).size !== conditions.length) fail("Use at most one condition of each type.", 400);
        for (const c of conditions) {
          if (c.type === "streak") { const h = own(this.habits, c.habitId ?? undefined); if (h.archived) fail("Choose an active habit.", 400); if (c.target > 3650) fail("Streak target is too high.", 400); }
          if (c.type === "level" && c.target > 100) fail("Maximum target level is 100.", 400);
        }
        const first = conditions[0];
        const data = { title: a.title !== undefined ? titleOf(a) : r?.title ?? fail("Title required.", 400), description: a.description ?? r?.description ?? "", category: a.category?.trim() || r?.category || "Personal", ruleType: first.type, target: first.target, habitId: first.type === "streak" ? first.habitId : null };
        const [saved] = r ? await this.tx.update(rewardsTable).set(data).where(and(eq(rewardsTable.id, r.id), eq(rewardsTable.userId, this.uid))).returning() : await this.tx.insert(rewardsTable).values({ ...data, userId: this.uid, createdAt: this.now }).returning();
        this.rewards = [saved, ...this.rewards.filter(x => x.id !== saved.id)];
        this.j.rewards[saved.id] = { conditions, claimCost: a.claimCost ?? old?.claimCost ?? 0, savingsTarget: a.savingsTarget ?? old?.savingsTarget ?? 0, savedAmount: a.savedAmount ?? old?.savedAmount ?? 0, savingsPerQuest: a.savingsPerQuest ?? old?.savingsPerQuest ?? 0 };
        this.message = "Reward saved. All requirements must be met."; break;
      }
      case "deleteReward": {
        const r = own(this.rewards, a.id); if (r.claimedAt) fail("Claimed trophies are immutable.");
        await this.tx.delete(rewardsTable).where(and(eq(rewardsTable.id, r.id), eq(rewardsTable.userId, this.uid)));
        this.rewards = this.rewards.filter(x => x.id !== r.id); delete this.j.rewards[r.id]; this.message = "Reward deleted."; break;
      }
      case "claimReward": {
        const r = own(this.rewards, a.id); if (r.claimedAt) fail("This reward was already claimed.");
        const view = this.rewardView(r); if (view.status !== "ready") fail("Meet every condition and the separate claim cost first.");
        this.player.gold -= view.claimCost;
        const [saved] = await this.tx.update(rewardsTable).set({ claimedAt: this.now }).where(and(eq(rewardsTable.id, r.id), eq(rewardsTable.userId, this.uid))).returning();
        this.rewards = this.rewards.map(x => x.id === r.id ? saved : x);
        this.event("claim", r.title); this.message = "CLAIMED - READY TO BUY IN REAL LIFE!"; this.effect = "reward"; break;
      }
      case "savings": {
        const r = own(this.rewards, a.id); if (r.claimedAt) fail("Claimed trophies are immutable.");
        this.j.rewards[r.id].savedAmount = a.savedAmount ?? fail("Provide a savings amount.", 400);
        this.message = "Virtual savings estimate updated. No money moved."; break;
      }
      case "buyItem": {
        const c = CATALOG.find(i => i.id === a.itemId) ?? fail("Merchant item not found.", 404);
        if (this.player.gold < c.price || levelForXp(this.player.xp).level < c.requiredLevel) fail("Not enough Gold or required level.");
        if (c.id === "boots" && this.j.inventory.some(i => i.catalogId === "boots" && i.quantity > 0)) fail("You already own Speed Boots; buffs do not stack.");
        this.player.gold -= c.price;
        const existing = this.j.inventory.find(i => i.catalogId === c.id);
        if (existing) existing.quantity++;
        else this.j.inventory.push({ id: randomUUID(), catalogId: c.id, name: c.name, description: c.description, quantity: 1, equipped: false, requiredLevel: c.requiredLevel, acquired: this.today });
        this.message = `${c.name} purchased. Equip or use it in inventory.`; break;
      }
      case "updateItem": case "deleteItem": case "equipItem": case "consumeItem": {
        const i = this.j.inventory.find(i => i.id === a.itemId && i.quantity > 0) ?? fail("Owned inventory item not found.", 404);
        if (a.action === "updateItem") { i.name = a.title !== undefined ? titleOf(a) : i.name; i.description = a.description ?? i.description; }
        if (a.action === "deleteItem") { i.quantity = 0; i.equipped = false; this.message = "Item discarded. No refund."; }
        if (a.action === "equipItem") {
          if (levelForXp(this.player.xp).level < i.requiredLevel) fail("Your level is too low.");
          if (i.catalogId === "camping") fail("Camping potions are consumed, not equipped.");
          i.equipped = a.equipped ?? !i.equipped;
        }
        if (a.action === "consumeItem") {
          if (i.catalogId === "shield") { i.equipped = true; this.message = "Shield armed: it will consume one charge on a missed habit."; }
          else if (i.catalogId === "camping") {
            if (this.j.protections[this.today]?.length) fail("Today is already protected.");
            const ids = this.habits.filter(h => !h.archived).map(h => h.id);
            if (!ids.length) fail("Add an active habit before camping.");
            i.quantity--; this.j.protections[this.today] = ids; this.message = "Camping active today: streaks freeze; no free XP.";
          } else fail("This item is not consumable.");
        }
        this.message ||= "Inventory updated."; break;
      }
      case "settings": {
        if (a.timezone !== undefined && a.timezone !== this.j.timezone) {
          if (!validTimezone(a.timezone)) fail("Choose a valid IANA timezone.", 400);
          if (this.j.timezoneConfigured && this.j.timezoneChangedAt && this.now.getTime() - Date.parse(this.j.timezoneChangedAt) < 7 * 86400000) fail("Timezone can be changed once every 7 days.");
          this.j.timezone = a.timezone; this.j.timezoneChangedAt = this.now.toISOString();
          this.today = localDay(this.now, a.timezone);
          for (const m of Object.values(this.j.habits)) if (m.created > this.today) {
            m.created = this.today;
            m.versions.unshift({ date: this.today, config: { ...m.versions[0].config } });
          }
          const yesterday = addDays(this.today, -1);
          if (this.j.lastSettled < yesterday) this.j.lastSettled = yesterday;
        }
        if (a.timezone !== undefined) this.j.timezoneConfigured = true;
        if (a.chestEnabled !== undefined) this.j.chestEnabled = a.chestEnabled;
        this.message = "Settings saved."; break;
      }
      case "drawChest": {
        if (!this.chestEligible()) fail("Complete all scheduled habits, enable chests, and respect the once-daily/24-hour limit.");
        const roll = randomInt(100), outcome = roll < 50 ? "10 Gold" : roll < 80 ? "Coffee break" : "Movie time";
        this.j.chests[this.today] = { outcome, at: this.now.toISOString(), habitIds: this.habits.filter(h => this.habitView(h).scheduledToday && !h.archived).map(h => h.id) };
        if (outcome === "10 Gold") this.player.gold += 10;
        this.event("chest", outcome, 0, outcome === "10 Gold" ? 10 : 0); this.message = `Daily chest: ${outcome}! No cash value.`; this.effect = "reward"; break;
      }
      case "profile": {
        if (a.username !== undefined) {
          const [taken] = await this.tx.select({ id: pixelQuestUsersTable.id }).from(pixelQuestUsersTable).where(sql`lower(${pixelQuestUsersTable.username}) = lower(${a.username}) AND ${pixelQuestUsersTable.id} <> ${this.uid}`);
          if (taken) fail("That username is already taken.");
          this.user.username = a.username;
        }
        if (a.avatarId !== undefined) {
          const avatar = AVATARS.find(v => v.id === a.avatarId)!;
          if (levelForXp(this.player.xp).level < avatar.requiredLevel) fail("That avatar is level-locked.");
          this.user.selectedAvatar = a.avatarId;
        }
        this.message = "Profile saved."; break;
      }
    }
  }
}

function freshJournal(now: Date): Journal {
  const today = localDay(now, "UTC");
  return { version: 1, since: today, timezone: "UTC", timezoneConfigured: false, timezoneChangedAt: null, lastSettled: addDays(today, -1), hp: 100, faintedUntil: null, habits: {}, quests: {}, rewards: {}, awards: {}, events: [], protections: {}, inventory: [], bosses: [], retiredBossIds: [], chestEnabled: false, chests: {}, requests: {}, settled: {} };
}
export interface ActionOutcome { xpEarned: number; leveledUp: boolean; multiplier: number }
export async function runGame(uid: string, input?: Action, now = new Date(), outcome?: ActionOutcome) {
  return db.transaction(async tx => {
    // All web and legacy mobile mutations share this account lock, including
    // balance updates and history writes. Different accounts remain independent.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${uid}, 0))`);
    const [state] = await tx.select().from(pixelRpgStateTable).where(eq(pixelRpgStateTable.userId, uid));
    const [user] = await tx.select().from(pixelQuestUsersTable).where(eq(pixelQuestUsersTable.id, uid));
    const [player] = await tx.select().from(playerProfileTable).where(eq(playerProfileTable.userId, uid)).for("update");
    if (!user || !player) fail("Account profile missing.", 404);
    // A transaction has one pg client: do not queue concurrent queries on it.
    const habits = await tx.select().from(habitsTable).where(eq(habitsTable.userId, uid)).orderBy(desc(habitsTable.createdAt));
    const quests = await tx.select().from(questTasksTable).where(eq(questTasksTable.userId, uid)).orderBy(desc(questTasksTable.createdAt));
    const rewards = await tx.select().from(rewardsTable).where(eq(rewardsTable.userId, uid)).orderBy(desc(rewardsTable.createdAt));
    const completions = await tx.select().from(habitCompletionsTable).where(eq(habitCompletionsTable.userId, uid));
    const j = state ? state.journal as Journal : freshJournal(now), today = localDay(now, j.timezone);
    j.retiredBossIds ??= [];
    // Backfill only records already owned by this account. No legacy adoption.
    for (const h of habits) if (!j.habits[h.id]) {
      const created = localDay(h.createdAt, j.timezone);
      const c: HabitConfig = { frequency: h.frequency, days: h.days, active: true, mandatory: false, target: 1, unit: "completion", stat: skill(h.category) };
      j.habits[h.id] = { created, title: h.title, versions: [{ date: created, config: c }, ...(h.archived ? [{ date: today, config: { ...c, active: false } }] : [])], values: {} };
    }
    for (const c of completions) {
      const meta = j.habits[c.habitId]; if (!meta) continue;
      if (!j.awards[`habit-${c.habitId}-${c.date}`]) {
        meta.values[c.date] = configOn(meta, c.date)?.target ?? 1;
        j.awards[`habit-${c.habitId}-${c.date}`] = { xp: c.xpAwarded, gold: c.xpAwarded, active: true, stat: configOn(meta, c.date)?.stat, title: meta.title, date: c.date, kind: "habit", legacy: true };
        j.events.push({ date: c.date, at: c.completedAt.toISOString(), xp: c.xpAwarded, gold: c.xpAwarded, kind: "habit", title: meta.title });
      }
    }
    for (const q of quests) {
      j.quests[q.id] ??= { tags: [], type: "single" };
      if (q.status === "completed" && !j.awards[`quest-${q.id}`]) {
        const date = localDay(q.completedAt ?? q.createdAt, j.timezone);
        j.awards[`quest-${q.id}`] = { xp: q.xpAwarded, gold: q.xpAwarded, active: true, title: q.title, date, kind: "quest", legacy: true };
        j.events.push({ date, at: (q.completedAt ?? q.createdAt).toISOString(), xp: q.xpAwarded, gold: q.xpAwarded, kind: "quest", title: q.title });
      }
    }
    for (const r of rewards) j.rewards[r.id] ??= { conditions: [{ type: r.ruleType as Condition["type"], target: r.target, habitId: r.habitId }], claimCost: r.ruleType === "gold" ? r.target : 0, savingsTarget: 0, savedAmount: 0, savingsPerQuest: 0 };
    const game = new Game(tx, uid, now, j, habits, quests, rewards, user, player);
    const xpBefore = player.xp, levelBefore = levelForXp(player.xp).level;
    game.settle();
    await game.bosses();
    if (input) {
      const action = PerformRpgActionBody.parse(input), fingerprint = JSON.stringify({ ...action, requestId: undefined });
      const replay = j.requests[action.requestId];
      if (replay) {
        if (replay.fingerprint !== fingerprint) fail("A request ID cannot be reused for a different action.");
        game.message = replay.message; game.effect = "none";
      } else {
        await game.action(action); await game.bosses();
        j.requests[action.requestId] = { fingerprint, message: game.message };
      }
    }
    const level = levelForXp(player.xp).level;
    const tier = AVATARS.filter(a => a.requiredLevel <= level).at(-1)!;
    const oldTier = AVATARS.filter(a => a.requiredLevel <= levelBefore).at(-1)!;
    if (tier.id !== oldTier.id || (AVATARS.find(a => a.id === user.selectedAvatar)?.requiredLevel ?? Infinity) > level) user.selectedAvatar = tier.id;
    if (outcome) {
      outcome.xpEarned = Math.max(0, player.xp - xpBefore);
      outcome.leveledUp = level > levelBefore;
      const baseXp = input?.action === "progressHabit" ? 25 : (XP[(quests.find(q => q.id === input?.id)?.difficulty ?? "medium") as keyof typeof XP] ?? XP.medium);
      outcome.multiplier = outcome.xpEarned ? outcome.xpEarned / baseXp : 1;
    }
    for (const a of AVATARS) if (levelBefore < a.requiredLevel && level >= a.requiredLevel) await tx.insert(playerMilestonesTable).values({ userId: uid, key: `level-${a.requiredLevel}`, title: `Level ${a.requiredLevel}: ${a.name} unlocked`, description: a.description, achievedAt: now }).onConflictDoNothing();
    await tx.update(playerProfileTable).set({ xp: player.xp, gold: player.gold, lifetimeTasksVanquished: player.lifetimeTasksVanquished }).where(eq(playerProfileTable.userId, uid));
    await tx.update(pixelQuestUsersTable).set({ username: user.username, selectedAvatar: user.selectedAvatar }).where(eq(pixelQuestUsersTable.id, uid));
    await tx.insert(pixelRpgStateTable).values({ userId: uid, journal: j, updatedAt: now }).onConflictDoUpdate({ target: pixelRpgStateTable.userId, set: { journal: j, updatedAt: now } });
    return game.snapshot();
  });
}
