import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool, pixelQuestUsersTable, playerProfileTable, habitsTable, habitCompletionsTable, questTasksTable } from "@workspace/db";
import { runGame, GameError, type Action } from "./rpg-game";
import { localDay, dayInstant, levelForXp, streaks, type HabitMeta } from "./rpg-rules";

const accounts: string[] = [];
const base = new Date("2026-10-20T10:00:00Z");
async function account(gold = 500, xp = 0) {
  const uid = `rpg-test-${randomUUID()}`; accounts.push(uid);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7864231)`);
    await tx.insert(pixelQuestUsersTable).values({ id: uid, username: `t_${randomUUID().replaceAll("-", "").slice(0, 16)}` });
    const [next] = await tx.select({ id: sql<number>`COALESCE(MAX(${playerProfileTable.id}),0)+1` }).from(playerProfileTable);
    await tx.insert(playerProfileTable).values({ id: next.id, userId: uid, xp, gold });
  });
  return uid;
}
function act(uid: string, a: Omit<Action, "requestId">, now = base, requestId = randomUUID()) {
  return runGame(uid, { ...a, requestId }, now);
}
const reject = (p: Promise<unknown>, status = 409) => assert.rejects(p, (e: unknown) => e instanceof GameError && e.status === status);
after(async () => {
  for (const uid of accounts) await db.delete(pixelQuestUsersTable).where(eq(pixelQuestUsersTable.id, uid));
  await pool.end();
});

test("local-day boundaries, DST midnight lengths and level thresholds", () => {
  assert.equal(localDay(new Date("2026-10-20T22:30Z"), "Europe/Istanbul"), "2026-10-21");
  assert.equal(localDay(new Date("2026-10-20T01:30Z"), "America/New_York"), "2026-10-19");
  assert.equal(dayInstant("2026-11-02", "America/New_York").getTime() - dayInstant("2026-11-01", "America/New_York").getTime(), 25 * 3600000);
  assert.equal(dayInstant("2026-03-09", "America/New_York").getTime() - dayInstant("2026-03-08", "America/New_York").getTime(), 23 * 3600000);
  assert.equal(levelForXp(99).level, 1); assert.equal(levelForXp(100).level, 2);
  assert.equal(levelForXp(300).level, 3); assert.equal(levelForXp(1000).level, 5);
});
test("scheduled off-days and protected days freeze streaks without adding completions", () => {
  const meta: HabitMeta = { created: "2026-10-19", title: "MWF", versions: [{ date: "2026-10-19", config: { frequency: "weekly", days: [1, 3, 5], target: 1, unit: "", mandatory: true, stat: "INT", active: true } }], values: { "2026-10-19": 1, "2026-10-23": 1 } };
  assert.deepEqual(streaks(meta, "2026-10-23", { "2026-10-21": [7] }, 7), { current: 2, best: 2 });
  assert.deepEqual(streaks(meta, "2026-10-23", {}, 7), { current: 1, best: 1 });
});
test("numeric progress, exact undo and idempotency cannot mint XP or skills", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveHabit", title: "Water", target: 8, unit: "cups", mandatory: true, stat: "STR" });
  const id = s.habits[0].id;
  s = await act(uid, { action: "progressHabit", id, value: 3 }); assert.equal(s.profile.xp, 0); assert.equal(s.habits[0].history.at(-1)?.status, "partial");
  const rid = randomUUID();
  s = await act(uid, { action: "progressHabit", id, value: 8 }, base, rid); assert.equal(s.profile.xp, 25); assert.equal(s.profile.gold, 510); assert.equal(s.skills.STR, 1);
  s = await act(uid, { action: "progressHabit", id, value: 8 }, base, rid); assert.equal(s.profile.xp, 25); assert.equal(s.effect, "none");
  await reject(act(uid, { action: "progressHabit", id, value: 0 }, base, rid));
  s = await act(uid, { action: "progressHabit", id, value: 8 }); assert.equal(s.profile.xp, 25);
  await reject(act(uid, { action: "saveHabit", id, target: 9 }));
  s = await act(uid, { action: "progressHabit", id, value: 0 }); assert.equal(s.profile.xp, 0); assert.equal(s.profile.gold, 500); assert.equal(s.skills.STR, 0);
  s = await act(uid, { action: "progressHabit", id, value: 8 }); assert.equal(s.profile.xp, 25); assert.equal(s.skills.STR, 1);
  await reject(act(uid, { action: "progressHabit", id, value: 8, date: "2026-10-19" }));
});
test("quest payouts and reopened quest payouts stay exact after edits", async () => {
  const uid = await account(); let xp = 0, gold = 500;
  for (const [difficulty, x, g] of [["easy", 10, 5], ["medium", 25, 15], ["hard", 50, 35]] as const) {
    let s = await act(uid, { action: "saveQuest", title: difficulty, difficulty });
    const id = s.quests[0].id;
    s = await act(uid, { action: "completeQuest", id }); xp += x; gold += g;
    assert.equal(s.profile.xp, xp); assert.equal(s.profile.gold, gold);
    if (difficulty === "hard") {
      await act(uid, { action: "completeQuest", id, completed: false });
      await act(uid, { action: "saveQuest", id, difficulty: "easy" });
      s = await act(uid, { action: "completeQuest", id });
      assert.equal(s.profile.xp, xp); assert.equal(s.profile.gold, gold); assert.equal(s.profile.lifetimeTasksVanquished, 3);
    }
  }
});
test("spent completion Gold cannot be undone and re-earned", async () => {
  const uid = await account(0);
  let s = await act(uid, { action: "saveHabit", title: "Read" }); const id = s.habits[0].id;
  await act(uid, { action: "progressHabit", id, value: 1 });
  s = await act(uid, { action: "saveReward", title: "Tea", conditions: [{ type: "gold", target: 10 }], claimCost: 10 });
  await act(uid, { action: "claimReward", id: s.rewards[0].id });
  await reject(act(uid, { action: "progressHabit", id, value: 0 }));
  s = await runGame(uid, undefined, base); assert.equal(s.profile.gold, 0); assert.equal(s.profile.xp, 25); assert.equal(s.habits[0].progress, 1);
});
test("boss payout, membership and rare loot cannot repeat through undo or deletion", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveQuest", title: "Weekly", type: "weekly", difficulty: "hard" });
  const id = s.quests[0].id; assert.equal(s.bosses.length, 1);
  s = await act(uid, { action: "completeQuest", id }); assert.equal(s.bosses[0].hp, 0); assert.equal(s.profile.gold, 575); assert.equal(s.inventory.filter(i => i.catalogId === "relic").length, 1);
  s = await act(uid, { action: "completeQuest", id }); assert.equal(s.profile.gold, 575); assert.equal(s.inventory.length, 1);
  await reject(act(uid, { action: "completeQuest", id, completed: false }));
  await act(uid, { action: "deleteQuest", id });
  s = await act(uid, { action: "saveQuest", title: "Second weekly", type: "weekly" }); assert.equal(s.bosses.length, 1); assert.equal(s.profile.gold, 575);
});
test("deleting an unfinished boss member retires the boss without loot", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveQuest", title: "Delete me", type: "weekly" });
  s = await act(uid, { action: "deleteQuest", id: s.quests[0].id });
  assert.equal(s.profile.gold, 500); assert.equal(s.inventory.length, 0); assert.equal(s.bosses.length, 0);
  s = await act(uid, { action: "saveQuest", title: "No respawn", type: "weekly" }); assert.equal(s.bosses.length, 0);
});
test("AND conditions and concurrent claims charge only the explicit cost once", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveHabit", title: "Study", stat: "INT" }); const hid = s.habits[0].id;
  s = await act(uid, { action: "saveReward", title: "Headphones", conditions: [{ type: "level", target: 1 }, { type: "streak", target: 1, habitId: hid }, { type: "gold", target: 100 }], claimCost: 50 });
  const id = s.rewards[0].id; assert.equal(s.rewards[0].status, "locked");
  await reject(act(uid, { action: "claimReward", id }));
  s = await act(uid, { action: "progressHabit", id: hid, value: 1 }); assert.equal(s.rewards[0].status, "ready");
  const results = await Promise.allSettled([act(uid, { action: "claimReward", id }), act(uid, { action: "claimReward", id })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  s = await runGame(uid, undefined, base); assert.equal(s.profile.gold, 460); assert.equal(s.rewards[0].status, "claimed");
});
test("shield, camping and offline settlement are persistent and once-only", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveHabit", title: "A", mandatory: true }); const a = s.habits[0].id;
  await act(uid, { action: "progressHabit", id: a, value: 1 });
  await act(uid, { action: "saveHabit", title: "B", mandatory: true });
  s = await act(uid, { action: "buyItem", itemId: "shield" });
  await act(uid, { action: "equipItem", itemId: s.inventory.find(i => i.catalogId === "shield")!.id, equipped: true });
  await act(uid, { action: "buyItem", itemId: "camping" });
  const next = new Date("2026-10-22T10:00Z");
  s = await runGame(uid, undefined, next); assert.equal(s.hp, 90); assert.equal(s.inventory.some(i => i.catalogId === "shield"), false);
  assert.equal(s.habits.find(h => h.id === a)!.history.find(d => d.date === "2026-10-21")!.status, "protected");
  s = await runGame(uid, undefined, next); assert.equal(s.hp, 90);
  s = await act(uid, { action: "consumeItem", itemId: s.inventory.find(i => i.catalogId === "camping")!.id }, next);
  assert.equal(s.campingToday, true); assert.equal(s.inventory.some(i => i.catalogId === "camping"), false);
  s = await runGame(uid, undefined, new Date("2026-10-23T10:00Z")); assert.equal(s.hp, 90); assert.equal(s.habits.find(h => h.id === a)!.streak, 1);
});
test("faint halves XP temporarily and elapsed recovery restores 50 HP", async () => {
  const uid = await account();
  for (let i = 0; i < 11; i++) await act(uid, { action: "saveHabit", title: `Mandatory ${i}`, mandatory: true });
  let s = await runGame(uid, undefined, new Date("2026-10-22T01:00Z")); assert.equal(s.hp, 0); assert.equal(s.faintedUntil, "2026-10-22T06:00:00.000Z");
  s = await act(uid, { action: "saveQuest", title: "Recovery", difficulty: "medium" }, new Date("2026-10-22T01:00Z"));
  s = await act(uid, { action: "completeQuest", id: s.quests[0].id }, new Date("2026-10-22T01:00Z")); assert.equal(s.profile.xp, 12); assert.equal(s.profile.gold, 515);
  s = await runGame(uid, undefined, new Date("2026-10-22T07:00Z")); assert.equal(s.hp, 50); assert.equal(s.faintedUntil, null);
});
test("timezone settlement spans DST without duplicate damage or retroactive activation", async () => {
  const uid = await account(); const before = new Date("2026-10-30T16:00Z");
  await act(uid, { action: "settings", timezone: "America/New_York" }, before);
  await act(uid, { action: "saveHabit", title: "Daily", mandatory: true }, before);
  let s = await runGame(uid, undefined, new Date("2026-11-02T14:00Z")); assert.equal(s.today, "2026-11-02"); assert.equal(s.hp, 80);
  s = await runGame(uid, undefined, new Date("2026-11-02T14:00Z")); assert.equal(s.hp, 80);
  await reject(act(uid, { action: "settings", timezone: "Europe/Istanbul" }, new Date("2026-11-02T14:00Z")));
});
test("first timezone setup crossing backwards over midnight remains usable", async () => {
  const uid = await account(), time = new Date("2026-10-20T01:00Z");
  await act(uid, { action: "saveHabit", title: "Late journal" }, time);
  const s = await act(uid, { action: "settings", timezone: "America/Los_Angeles" }, time);
  assert.equal(s.today, "2026-10-19"); assert.equal(s.habits[0].scheduledToday, true); assert.equal(s.hp, 100);
});
test("Speed Boots morning effect is singular and uses the configured timezone", async () => {
  const uid = await account(); const morning = new Date("2026-10-20T07:00Z");
  await act(uid, { action: "settings", timezone: "Europe/Istanbul" }, morning);
  let s = await act(uid, { action: "buyItem", itemId: "boots" }, morning);
  await act(uid, { action: "equipItem", itemId: s.inventory[0].id, equipped: true }, morning);
  await reject(act(uid, { action: "buyItem", itemId: "boots" }, morning));
  s = await act(uid, { action: "saveQuest", title: "Morning", difficulty: "hard" }, morning);
  s = await act(uid, { action: "completeQuest", id: s.quests[0].id }, morning); assert.equal(s.profile.xp, 52); assert.equal(s.profile.gold, 435);
  s = await act(uid, { action: "saveQuest", title: "Evening", difficulty: "hard" }, new Date("2026-10-20T17:00Z"));
  s = await act(uid, { action: "completeQuest", id: s.quests[0].id }, new Date("2026-10-20T17:00Z")); assert.equal(s.profile.xp, 102);
});
test("daily chest races, qualifying undo and retry cannot duplicate prizes", async () => {
  const uid = await account();
  await act(uid, { action: "settings", chestEnabled: true });
  let s = await act(uid, { action: "saveHabit", title: "Daily" }); const id = s.habits[0].id;
  assert.equal(s.chest.eligible, false);
  await act(uid, { action: "progressHabit", id, value: 1 });
  const rid = randomUUID();
  const draws = await Promise.allSettled([act(uid, { action: "drawChest" }, base, rid), act(uid, { action: "drawChest" })]);
  assert.equal(draws.filter(r => r.status === "fulfilled").length, 1);
  s = await runGame(uid, undefined, base); assert.equal(s.chest.opened, true); assert.equal(s.chest.history.length, 1);
  assert.ok(s.chest.rewards.some(r => r.label === s.chest.outcome));
  await reject(act(uid, { action: "progressHabit", id, value: 0 }));
  const gold = s.profile.gold;
  s = await act(uid, { action: "drawChest" }, base, rid); assert.equal(s.profile.gold, gold);
});
test("accounts cannot mutate each other's habits, quests, rewards or inventory", async () => {
  const a = await account(), b = await account();
  let s = await act(a, { action: "saveHabit", title: "Private" }); const h = s.habits[0].id;
  s = await act(a, { action: "saveQuest", title: "Private" }); const q = s.quests[0].id;
  s = await act(a, { action: "saveReward", title: "Private", conditions: [{ type: "level", target: 1 }] }); const r = s.rewards[0].id;
  s = await act(a, { action: "buyItem", itemId: "shield" }); const item = s.inventory[0].id;
  await reject(act(b, { action: "progressHabit", id: h }), 404);
  await reject(act(b, { action: "completeQuest", id: q }), 404);
  await reject(act(b, { action: "claimReward", id: r }), 404);
  await reject(act(b, { action: "equipItem", itemId: item }), 404);
  await reject(act(b, { action: "profile", avatarId: "paladin" }));
  s = await runGame(b, undefined, base); assert.equal(s.habits.length, 0); assert.equal(s.profile.gold, 500);
});
test("existing owned progress migrates without resetting balances or applying old penalties", async () => {
  const uid = await account(80, 100);
  const [h] = await db.insert(habitsTable).values({ userId: uid, title: "Legacy", category: "Reading", createdAt: new Date("2026-10-01T12:00Z") }).returning();
  await db.insert(habitCompletionsTable).values({ userId: uid, habitId: h.id, date: "2026-10-19", xpAwarded: 25, completedAt: new Date("2026-10-19T12:00Z") });
  const [q] = await db.insert(questTasksTable).values({ userId: uid, title: "Legacy task", category: "Personal", status: "completed", xpAwarded: 25, completedAt: base }).returning();
  let s = await runGame(uid, undefined, base); assert.equal(s.hp, 100); assert.equal(s.profile.xp, 100); assert.equal(s.profile.gold, 80); assert.equal(s.habits[0].mandatory, false);
  s = await act(uid, { action: "completeQuest", id: q.id, completed: false }); assert.equal(s.profile.gold, 55); assert.equal(s.profile.xp, 75);
  s = await act(uid, { action: "completeQuest", id: q.id }); assert.equal(s.profile.gold, 80); assert.equal(s.profile.xp, 100);
  s = await runGame(uid, undefined, new Date("2026-10-25T10:00Z")); assert.equal(s.hp, 100);
});
test("weekly history reports earnings, not balances, and savings cannot farm undo", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveReward", title: "Trip", conditions: [{ type: "level", target: 10 }], savingsTarget: 100, savingsPerQuest: 5 });
  s = await act(uid, { action: "saveQuest", title: "Small win", difficulty: "easy" }); const q = s.quests[0].id;
  s = await act(uid, { action: "completeQuest", id: q }); assert.equal(s.rewards[0].savedAmount, 5); assert.equal(s.currentWeek.xp, 10); assert.equal(s.currentWeek.gold, 5);
  await act(uid, { action: "completeQuest", id: q, completed: false });
  s = await act(uid, { action: "completeQuest", id: q }); assert.equal(s.rewards[0].savedAmount, 5); assert.equal(s.currentWeek.xp, 10);
  s = await act(uid, { action: "buyItem", itemId: "shield" }); assert.equal(s.currentWeek.gold, 5); assert.equal(s.profile.gold, 475);
});
test("concurrent legacy completion responses report only their own atomic payout", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveQuest", title: "A", difficulty: "easy" }); const a = s.quests[0].id;
  s = await act(uid, { action: "saveQuest", title: "B", difficulty: "hard" }); const b = s.quests[0].id;
  const first = { xpEarned: 0, leveledUp: false, multiplier: 1 }, second = { ...first };
  await Promise.all([
    runGame(uid, { action: "completeQuest", id: a, requestId: randomUUID() }, base, first),
    runGame(uid, { action: "completeQuest", id: b, requestId: randomUUID() }, base, second),
  ]);
  assert.equal(first.xpEarned, 10); assert.equal(second.xpEarned, 50);
  s = await runGame(uid, undefined, base); assert.equal(s.profile.xp, 60); assert.equal(s.profile.gold, 540);
});
test("claimed trophies freeze savings, while manual savings remain virtual", async () => {
  const uid = await account();
  let s = await act(uid, { action: "saveReward", title: "A trip", conditions: [{ type: "level", target: 1 }], savingsTarget: 100, savingsPerQuest: 10 });
  const id = s.rewards[0].id;
  s = await act(uid, { action: "savings", id, savedAmount: 50 }); assert.equal(s.profile.gold, 500);
  await act(uid, { action: "claimReward", id });
  s = await act(uid, { action: "saveQuest", title: "After claiming", difficulty: "easy" });
  s = await act(uid, { action: "completeQuest", id: s.quests[0].id }); assert.equal(s.rewards[0].savedAmount, 50);
  await reject(act(uid, { action: "savings", id, savedAmount: 100 }));
});
