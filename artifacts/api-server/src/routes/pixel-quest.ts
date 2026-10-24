import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request } from "express";
import { db, pixelQuestUsersTable, playerProfileTable, playerMilestonesTable } from "@workspace/db";
import {
  PerformRpgActionBody, CreateHabitBody, UpdateHabitBody, CompleteHabitBody, UndoHabitCompletionBody,
  CreateTaskBody, UpdateTaskBody, CreateRewardBody, UpdateRewardBody, UpdatePixelQuestProfileBody,
  GetTasksQueryParams, GetHabitsQueryParams, ParseVoiceBody, ParseVoiceResponse, VerifyPhotoBody, VerifyPhotoResponse,
  QuestAssistantBody, QuestAssistantResponse,
  RewardAssistantBody, RewardAssistantResponse,
} from "@workspace/api-zod";
import { runGame, GameError, type Action, type ActionOutcome } from "../lib/rpg-game";
import { levelForXp } from "../lib/rpg-rules";
import { decodeVoiceAudio, parseVoiceAudio, VoiceProcessingError } from "../lib/voice-intake";
import { decodePhoto, PhotoVerificationError, verifyPhotoEvidence } from "../lib/photo-verification";
import { QuestAssistantError, suggestQuestDraft } from "../lib/quest-assistant";
import { RewardAssistantError, suggestRewardDraft } from "../lib/reward-assistant";
import { consumeAiRequestLimit } from "../lib/ai-request-limiter";

declare global { namespace Express { interface Request { pixelQuestUserId?: string } } }
const router: IRouter = Router();

/** Preserve the existing private-account bootstrap. Unowned demo rows stay unowned. */
async function ensureAccount(uid: string) {
  const [existing] = await db.select({ id: playerProfileTable.id }).from(playerProfileTable).where(eq(playerProfileTable.userId, uid)).limit(1);
  if (existing) return;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7864231)`);
    const users = await tx.insert(pixelQuestUsersTable).values({ id: uid, username: `hero_${uid.replace(/[^a-z0-9]/gi, "").slice(-14).toLowerCase()}` }).onConflictDoNothing().returning();
    const [profile] = await tx.select({ id: playerProfileTable.id }).from(playerProfileTable).where(eq(playerProfileTable.userId, uid));
    if (!profile) {
      const [next] = await tx.select({ id: sql<number>`COALESCE(MAX(${playerProfileTable.id}),0)+1` }).from(playerProfileTable);
      await tx.insert(playerProfileTable).values({ id: next.id, userId: uid, xp: 0, gold: 0, lifetimeTasksVanquished: 0, hasCompletedOnboarding: users.length === 0 });
    }
    if (users.length) await tx.insert(playerMilestonesTable).values({ userId: uid, key: "account-created", title: "Your quest begins", description: "Created a Pixel Quest adventurer profile." }).onConflictDoNothing();
  });
}
const uid = (req: Request) => req.pixelQuestUserId!;
const id = (v: unknown) => {
  const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new GameError(400, "Invalid record ID."); return n;
};
const requestId = (req: Request) => req.get("Idempotency-Key") ?? randomUUID();
const action = (req: Request, input: Omit<Action, "requestId">, outcome?: ActionOutcome) => runGame(uid(req), PerformRpgActionBody.parse({ ...input, requestId: requestId(req) }), new Date(), outcome);
const find = <T extends { id: number }>(rows: T[], n: number) => rows.find(x => x.id === n) ?? (() => { throw new GameError(404, "Owned record not found."); })();
function consumePhoto(body: { imageBase64: string; mimeType: string }, rawBody: unknown) {
  const encoded = body.imageBase64;
  body.imageBase64 = "";
  if (rawBody && typeof rawBody === "object" && "imageBase64" in rawBody) {
    (rawBody as { imageBase64?: unknown }).imageBase64 = "";
  }
  return decodePhoto(encoded, body.mimeType);
}
const profile = (s: Awaited<ReturnType<typeof runGame>>) => ({
  ...s.profile, ...levelForXp(s.profile.xp), streak: Math.max(0, ...s.profile.habitStreaks.map(h => h.currentStreak)),
  title: s.profile.avatars.filter(a => a.unlocked).at(-1)?.name ?? "Novice",
});

router.use("/pixelquest", async (req, res, next) => {
  try {
    const auth = getAuth(req), claim = auth.sessionClaims?.userId;
    const user = typeof claim === "string" ? claim : auth.userId;
    if (!user) { res.status(401).json({ error: "Sign in to access your player profile." }); return; }
    req.pixelQuestUserId = user; await ensureAccount(user); next();
  } catch (e) { next(e); }
});
router.use("/ai", async (req, res, next) => {
  try {
    const auth = getAuth(req), claim = auth.sessionClaims?.userId;
    const user = typeof claim === "string" ? claim : auth.userId;
    if (!user) { res.status(401).json({ error: "Sign in to use AI features." }); return; }
    req.pixelQuestUserId = user; await ensureAccount(user); next();
  } catch (e) { next(e); }
});
router.post("/ai/reward-assistant", async (req, res) => {
  const parsed = RewardAssistantBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.prompt.trim()) {
    res.status(400).json({ error: "Enter a short description of your real-life reward." });
    return;
  }
  // Share the assistant budget across reward, habit and quest suggestions.
  if (!(await consumeAiRequestLimit(uid(req), "assistant"))) {
    res.status(429).json({ error: "Too many AI suggestions. Please wait a minute and try again." });
    return;
  }
  try {
    res.json(RewardAssistantResponse.parse(await suggestRewardDraft(parsed.data.prompt.trim())));
  } catch (error) {
    if (error instanceof RewardAssistantError) {
      req.log.warn({ status: error.status }, "Reward assistant request failed");
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});
router.post("/ai/quest-assistant", async (req, res) => {
  const parsed = QuestAssistantBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.prompt.trim()) {
    res.status(400).json({ error: "Enter a short description for a habit or quest." });
    return;
  }
  if (!(await consumeAiRequestLimit(uid(req), "assistant"))) {
    res.status(429).json({ error: "Too many AI suggestions. Please wait a minute and try again." });
    return;
  }
  try {
    const current = await runGame(uid(req));
    res.json(QuestAssistantResponse.parse(
      await suggestQuestDraft(parsed.data.itemType, parsed.data.prompt.trim(), current.today),
    ));
  } catch (error) {
    if (error instanceof QuestAssistantError) {
      if (error.status >= 500) req.log.warn({ status: error.status }, "Quest assistant request failed");
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});
router.post("/pixelquest/voice/parse", async (req, res) => {
  if (!(await consumeAiRequestLimit(uid(req), "voice"))) {
    res.status(429).json({ error: "Too many voice requests. Please wait a minute and try again." });
    return;
  }
  try {
    const parsedBody = ParseVoiceBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid audio request. Please record a short supported audio clip." });
      return;
    }
    const body = parsedBody.data;
    const audio = decodeVoiceAudio(body.audioBase64, body.mimeType);
    const result = ParseVoiceResponse.safeParse(await parseVoiceAudio(audio, body.mimeType));
    if (!result.success) throw new VoiceProcessingError("Voice processing returned an invalid response.", 502);
    res.json(result.data);
  } catch (error) {
    if (error instanceof VoiceProcessingError) {
      if (error.status >= 500) req.log.warn({ status: error.status }, "Voice processing request failed");
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});
router.post("/ai/verify-photo", async (req, res) => {
  const parsed = VerifyPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid JPEG, PNG, or WebP photo under 5 MB." });
    return;
  }
  if (!(await consumeAiRequestLimit(uid(req), "photo"))) {
    res.status(429).json({ error: "Too many photo checks. Please wait a minute and try again." });
    return;
  }
  try {
    const body = parsed.data;
    const current = await runGame(uid(req));
    let itemTitle = "";
    let habitTarget = 1;
    if (body.itemType === "habit") {
      const habit = current.habits.find(item => item.id === body.itemId);
      if (!habit) { res.status(404).json({ error: "Habit not found." }); return; }
      if (!habit.requiresPhotoProof) { res.status(409).json({ error: "Photo proof is not enabled for this habit." }); return; }
      if (habit.archived || !habit.scheduledToday || habit.progress >= habit.target) {
        res.status(409).json({ error: "This habit cannot be completed with photo proof right now." });
        return;
      }
      itemTitle = habit.title;
      habitTarget = habit.target;
    } else {
      const quest = current.quests.find(item => item.id === body.itemId);
      if (!quest) { res.status(404).json({ error: "Quest not found." }); return; }
      if (!quest.requiresPhotoProof) { res.status(409).json({ error: "Photo proof is not enabled for this quest." }); return; }
      if (quest.status === "completed") { res.status(409).json({ error: "This quest is already complete." }); return; }
      itemTitle = quest.title;
    }

    const image = consumePhoto(body, req.body);
    const decision = await (async () => {
      try { return await verifyPhotoEvidence(image, body.mimeType, body.itemType, itemTitle); }
      finally { image.fill(0); }
    })();
    if (!decision.isVerified) {
      res.json(VerifyPhotoResponse.parse({ isVerified: false, reason: decision.reason }));
      return;
    }

    const outcome: ActionOutcome = { xpEarned: 0, leveledUp: false, multiplier: 1 };
    const proof = { itemType: body.itemType, itemId: body.itemId, date: current.today } as const;
    const actionInput: Action = body.itemType === "habit"
      ? PerformRpgActionBody.parse({ action: "progressHabit", id: body.itemId, value: habitTarget, date: current.today, requestId: randomUUID() })
      : PerformRpgActionBody.parse({ action: "completeQuest", id: body.itemId, completed: true, requestId: randomUUID() });
    const snapshot = await runGame(uid(req), actionInput, new Date(), outcome, proof);
    const completed = body.itemType === "habit"
      ? snapshot.habits.some(item => item.id === body.itemId && item.progress >= item.target)
      : snapshot.quests.some(item => item.id === body.itemId && item.status === "completed");
    if (!completed) throw new GameError(409, "The item changed during verification. Please try again.");
    res.json(VerifyPhotoResponse.parse({ isVerified: true, reason: decision.reason, snapshot }));
  } catch (error) {
    if (error instanceof PhotoVerificationError) {
      if (error.status >= 500) req.log.warn({ status: error.status }, "Photo verification request failed");
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});
router.get("/pixelquest/rpg", async (req, res) => { res.json(await runGame(uid(req))); });
router.post("/pixelquest/rpg/actions", async (req, res) => {
  res.json(await runGame(uid(req), PerformRpgActionBody.parse(req.body)));
});
// Compatibility adapters preserve the old generated mobile contracts, while all
// writes use the same transactional economy and compound-condition enforcement.
router.get("/pixelquest/profile", async (req, res) => { res.json((await runGame(uid(req))).profile); });
router.patch("/pixelquest/profile", async (req, res) => {
  const b = UpdatePixelQuestProfileBody.parse(req.body);
  res.json((await action(req, { action: "profile", ...b })).profile);
});
router.get("/pixelquest/dashboard", async (req, res) => {
  const s = await runGame(uid(req)), habits = s.habits.filter(h => !h.archived && h.scheduledToday);
  const completedTasks = s.quests.filter(q => q.status === "completed").length;
  const completed = habits.filter(h => h.progress >= h.target).length;
  const recentActivity = [
    ...s.habits.flatMap(h => h.completedDates.map(d => ({ id: `habit-${h.id}-${d}`, label: h.title, kind: "habit", happenedAt: `${String(d).slice(0, 10)}T12:00:00Z` }))),
    ...s.quests.filter(q => q.completedAt).map(q => ({ id: `quest-${q.id}`, label: q.title, kind: "task", happenedAt: q.completedAt })),
  ].sort((a, b) => String(b.happenedAt).localeCompare(String(a.happenedAt))).slice(0, 12);
  res.json({ profile: profile(s), completedTasks, activeHabits: habits.length, completionRate: habits.length ? Math.round(completed / habits.length * 100) : 0, totalCompletions: s.habits.reduce((n, h) => n + h.completedDates.length, 0) + completedTasks, recentActivity });
});
router.get("/pixelquest/habits", async (req, res) => {
  const p = GetHabitsQueryParams.parse(req.query.archived === undefined ? {} : { archived: req.query.archived === "true" });
  res.json((await runGame(uid(req))).habits.filter(h => h.archived === (p.archived ?? false)));
});
router.post("/pixelquest/habits", async (req, res) => {
  const b = CreateHabitBody.parse(req.body);
  const s = await action(req, { action: "saveHabit", ...b }); res.status(201).json(s.habits[0]);
});
router.patch("/pixelquest/habits/:habitId", async (req, res) => {
  const n = id(req.params.habitId), b = UpdateHabitBody.parse(req.body);
  res.json(find((await action(req, { action: "saveHabit", id: n, ...b })).habits, n));
});
router.delete("/pixelquest/habits/:habitId", async (req, res) => {
  await action(req, { action: "deleteHabit", id: id(req.params.habitId) }); res.sendStatus(204);
});
router.put("/pixelquest/habits/:habitId/completions", async (req, res) => {
  const n = id(req.params.habitId), b = CompleteHabitBody.parse(req.body);
  const outcome = { xpEarned: 0, leveledUp: false, multiplier: 1 };
  const s = await action(req, { action: "progressHabit", id: n, date: String(b.date instanceof Date ? b.date.toISOString() : b.date).slice(0, 10) }, outcome);
  res.json({ ...outcome, profile: profile(s) });
});
router.delete("/pixelquest/habits/:habitId/completions", async (req, res) => {
  const b = UndoHabitCompletionBody.parse(req.body);
  await action(req, { action: "progressHabit", id: id(req.params.habitId), value: 0, date: String(b.date instanceof Date ? b.date.toISOString() : b.date).slice(0, 10) }); res.sendStatus(204);
});
router.get("/pixelquest/tasks", async (req, res) => {
  const p = GetTasksQueryParams.parse(req.query);
  res.json((await runGame(uid(req))).quests.filter(q => (!p.status || p.status === "all" || p.status === q.status) && (!p.difficulty || q.difficulty === p.difficulty)));
});
router.post("/pixelquest/tasks", async (req, res) => {
  const b = CreateTaskBody.parse(req.body);
  const { stat, ...task } = b;
  const s = await action(req, { action: "saveQuest", ...task, questStat: stat, dueDate: b.dueDate ? String(b.dueDate instanceof Date ? b.dueDate.toISOString() : b.dueDate).slice(0, 10) : null });
  res.status(201).json(s.quests[0]);
});
router.patch("/pixelquest/tasks/:taskId", async (req, res) => {
  const n = id(req.params.taskId), b = UpdateTaskBody.parse(req.body);
  const { stat, ...task } = b;
  res.json(find((await action(req, { action: "saveQuest", ...task, questStat: stat, id: n, dueDate: b.dueDate === undefined ? undefined : b.dueDate ? String(b.dueDate instanceof Date ? b.dueDate.toISOString() : b.dueDate).slice(0, 10) : null })).quests, n));
});
router.delete("/pixelquest/tasks/:taskId", async (req, res) => {
  await action(req, { action: "deleteQuest", id: id(req.params.taskId) }); res.sendStatus(204);
});
router.put("/pixelquest/tasks/:taskId/completion", async (req, res) => {
  const outcome = { xpEarned: 0, leveledUp: false, multiplier: 1 };
  const s = await action(req, { action: "completeQuest", id: id(req.params.taskId), completed: true }, outcome);
  res.json({ ...outcome, profile: profile(s) });
});
router.delete("/pixelquest/tasks/:taskId/completion", async (req, res) => {
  const n = id(req.params.taskId);
  const s = await action(req, { action: "completeQuest", id: n, completed: false }); res.json(find(s.quests, n));
});
router.get("/pixelquest/rewards", async (req, res) => { res.json((await runGame(uid(req))).rewards); });
router.post("/pixelquest/rewards", async (req, res) => {
  const b = CreateRewardBody.parse(req.body);
  const s = await action(req, { action: "saveReward", title: b.title, description: b.description, category: b.category, conditions: [{ type: b.ruleType, target: b.target, habitId: b.habitId }], claimCost: b.ruleType === "gold" ? b.target : 0 });
  res.status(201).json(s.rewards[0]);
});
router.patch("/pixelquest/rewards/:rewardId", async (req, res) => {
  const n = id(req.params.rewardId), b = UpdateRewardBody.parse(req.body), s = await runGame(uid(req)), r = find(s.rewards, n);
  const ruleEdit = b.ruleType !== undefined || b.target !== undefined || b.habitId !== undefined;
  if (ruleEdit && r.conditions.length > 1) throw new GameError(409, "Edit compound requirements in the web RPG shop.");
  const type = b.ruleType ?? r.ruleType;
  const updated = await action(req, { action: "saveReward", id: n, title: b.title, description: b.description, category: b.category, ...(ruleEdit ? { conditions: [{ type, target: b.target ?? r.target, habitId: b.habitId ?? r.habitId }], claimCost: type === "gold" ? b.target ?? r.target : 0 } : {}) });
  res.json(find(updated.rewards, n));
});
router.delete("/pixelquest/rewards/:rewardId", async (req, res) => {
  await action(req, { action: "deleteReward", id: id(req.params.rewardId) }); res.sendStatus(204);
});
router.post("/pixelquest/rewards/:rewardId/claim", async (req, res) => {
  const n = id(req.params.rewardId);
  res.json(find((await action(req, { action: "claimReward", id: n })).rewards, n));
});
router.get("/pixelquest/achievements", async (req, res) => {
  const s = await runGame(uid(req)), count = s.profile.lifetimeTasksVanquished;
  const habit = s.habits.some(h => h.completedDates.length > 0);
  res.json([
    { id: "first-blood", name: "First Blood", description: "Complete your first quest.", unlocked: count >= 1 },
    { id: "habit-starter", name: "First Steps", description: "Complete a habit for the first time.", unlocked: habit },
    { id: "iron-will", name: "Iron Will", description: "Keep a seven-day habit streak.", unlocked: s.profile.highestHabitStreak >= 7 },
    { id: "quest-collector", name: "Quest Collector", description: "Complete ten quests.", unlocked: count >= 10 },
    { id: "habit-paladin", name: "Habit Paladin", description: "Reach level 10.", unlocked: s.profile.level >= 10 },
  ]);
});
router.use((error: unknown, req: Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof GameError) { res.status(error.status).json({ error: error.message }); return; }
  if (error && typeof error === "object" && "issues" in error) { res.status(400).json({ error: "Invalid action input.", details: error.issues }); return; }
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    const username = "constraint" in error && error.constraint === "pixel_quest_users_username_unique";
    res.status(409).json({ error: username ? "That username is already taken." : "That value is already in use." }); return;
  }
  next(error);
});
export default router;
