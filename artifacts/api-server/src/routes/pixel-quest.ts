import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type RequestHandler } from "express";
import {
  ClaimRewardParams,
  ClaimRewardResponse,
  CompleteHabitBody,
  CompleteHabitParams,
  CompleteHabitResponse,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateHabitBody,
  CreateHabitResponse,
  CreateRewardBody,
  CreateRewardResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  GetAchievementsResponse,
  GetHabitsQueryParams,
  GetHabitsResponse,
  GetPixelQuestDashboardResponse,
  GetPixelQuestProfileResponse,
  GetRewardsResponse,
  GetTasksQueryParams,
  GetTasksResponse,
  HabitCompletionUndoInput,
  UndoHabitCompletionBody,
  UndoHabitCompletionParams,
  UndoTaskCompletionParams,
  UndoTaskCompletionResponse,
  UpdateRewardBody,
  UpdateRewardParams,
  UpdateRewardResponse,
  UpdatePixelQuestProfileBody,
  UpdatePixelQuestProfileResponse,
  UpdateHabitBody,
  UpdateHabitParams,
  UpdateHabitResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
  DeleteRewardParams,
} from "@workspace/api-zod";
import {
  db,
  habitCompletionsTable,
  habitsTable,
  playerProfileTable,
  playerMilestonesTable,
  pixelQuestUsersTable,
  questTasksTable,
  rewardsTable,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      pixelQuestUserId?: string;
    }
  }
}

const router: IRouter = Router();
const BASE_XP = 25;
const TASK_XP = { easy: 10, medium: 25, hard: 50 } as const;

type Difficulty = keyof typeof TASK_XP;
type AvatarId = "novice" | "squire" | "knight" | "paladin";
type RewardRule = "streak" | "gold" | "level";

const AVATARS: {
  id: AvatarId;
  name: string;
  role: string;
  description: string;
  requiredLevel: number;
}[] = [
  {
    id: "novice",
    name: "Novice",
    role: "Adventurer",
    description: "A new adventurer ready for the first quest.",
    requiredLevel: 1,
  },
  {
    id: "squire",
    name: "Squire",
    role: "Woodland guard",
    description: "Light armor and a wooden sword.",
    requiredLevel: 5,
  },
  {
    id: "knight",
    name: "Knight",
    role: "Steel protector",
    description: "Full steel armor, cape, and shield.",
    requiredLevel: 10,
  },
  {
    id: "paladin",
    name: "Grandmaster",
    role: "Paladin",
    description: "Legendary armor with a crown, wings, and aura.",
    requiredLevel: 20,
  },
];

function asDateString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function utcToday(): string {
  return asDateString(new Date());
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return asDateString(date);
}

function currentStreak(dateValues: string[], today = utcToday()): number {
  const completed = new Set(dateValues);
  let cursor = completed.has(today) ? today : addDays(today, -1);
  if (!completed.has(cursor)) return 0;

  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function levelForXp(xp: number): {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
} {
  let remaining = Math.max(0, xp);
  let level = 1;
  while (remaining >= level * 100) {
    remaining -= level * 100;
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpToNextLevel: level * 100 };
}

function playerTitle(level: number): string {
  if (level >= 20) return "Grandmaster Paladin";
  if (level >= 10) return "Habit Paladin";
  if (level >= 5) return "Task Squire";
  return "Novice Adventurer";
}

function makeProfile(xp: number, gold: number, streak: number) {
  const progress = levelForXp(xp);
  return {
    xp,
    gold,
    ...progress,
    streak,
    title: playerTitle(progress.level),
  };
}

function getUserId(req: Request): string {
  if (!req.pixelQuestUserId) {
    throw new Error("Authenticated Pixel Quest account is missing.");
  }
  return req.pixelQuestUserId;
}

function defaultUsername(userId: string): string {
  return `hero_${userId.replace(/[^a-z0-9]/gi, "").slice(-14).toLowerCase()}`;
}

function avatarForLevel(level: number): AvatarId {
  return [...AVATARS]
    .reverse()
    .find((avatar) => level >= avatar.requiredLevel)?.id ?? "novice";
}

async function ensurePixelQuestAccount(userId: string): Promise<void> {
  const [existingProfile] = await db.select({ id: playerProfileTable.id }).from(playerProfileTable).where(eq(playerProfileTable.userId, userId)).limit(1);
  if (existingProfile) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7864231)`);
    const insertedUser = await tx
      .insert(pixelQuestUsersTable)
      .values({ id: userId, username: defaultUsername(userId) })
      .onConflictDoNothing()
      .returning({ id: pixelQuestUsersTable.id });

    const [ownedProfile] = await tx
      .select({ id: playerProfileTable.id })
      .from(playerProfileTable)
      .where(eq(playerProfileTable.userId, userId))
      .limit(1);

    if (!ownedProfile) {
      const [next] = await tx
        .select({
          id: sql<number>`COALESCE(MAX(${playerProfileTable.id}), 0) + 1`,
        })
        .from(playerProfileTable);
      await tx.insert(playerProfileTable).values({
        id: next.id,
        userId,
        xp: 0,
        gold: 0,
        lifetimeTasksVanquished: 0,
      });
    }

    if (insertedUser.length) {
      await tx
        .insert(playerMilestonesTable)
        .values({
          userId,
          key: "account-created",
          title: "Your quest begins",
          description: "Created a Pixel Quest adventurer profile.",
        })
        .onConflictDoNothing();
    }
  });
}

router.use("/pixelquest", (async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const claimedUserId = auth.sessionClaims?.userId;
    const userId = typeof claimedUserId === "string" ? claimedUserId : auth.userId;
    if (!userId) {
      res.status(401).json({ error: "Sign in to access your player profile." });
      return;
    }
    req.pixelQuestUserId = userId;
    await ensurePixelQuestAccount(userId);
    next();
  } catch (error) {
    next(error);
  }
}) satisfies RequestHandler);

async function readBalances(
  userId: string,
): Promise<{ xp: number; gold: number; lifetimeTasksVanquished: number }> {
  const [player] = await db
    .select({
      xp: playerProfileTable.xp,
      gold: playerProfileTable.gold,
      lifetimeTasksVanquished: playerProfileTable.lifetimeTasksVanquished,
    })
    .from(playerProfileTable)
    .where(eq(playerProfileTable.userId, userId))
    .limit(1);
  return {
    xp: player?.xp ?? 0,
    gold: player?.gold ?? 0,
    lifetimeTasksVanquished: player?.lifetimeTasksVanquished ?? 0,
  };
}

async function readHabitDates(userId: string): Promise<string[]> {
  const rows = await db
    .select({ date: habitCompletionsTable.date })
    .from(habitCompletionsTable)
    .where(eq(habitCompletionsTable.userId, userId));
  return rows.map((row) => row.date);
}

async function getPlayerProfile(userId: string) {
  const [balances, dates] = await Promise.all([
    readBalances(userId),
    readHabitDates(userId),
  ]);
  return makeProfile(balances.xp, balances.gold, currentStreak(dates));
}

function longestStreak(dateValues: string[]): number {
  const sortedDates = [...new Set(dateValues)].sort();
  let best = 0;
  let run = 0;
  let previous: string | undefined;
  for (const date of sortedDates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

async function getProfileDetails(userId: string) {
  const [user, balances, completions, habits, milestones] = await Promise.all([
    db
      .select()
      .from(pixelQuestUsersTable)
      .where(eq(pixelQuestUsersTable.id, userId))
      .limit(1),
    readBalances(userId),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable)
      .where(eq(habitCompletionsTable.userId, userId)),
    db
      .select({ id: habitsTable.id, title: habitsTable.title })
      .from(habitsTable)
      .where(eq(habitsTable.userId, userId)),
    db
      .select()
      .from(playerMilestonesTable)
      .where(eq(playerMilestonesTable.userId, userId))
      .orderBy(desc(playerMilestonesTable.achievedAt)),
  ]);
  const datesByHabit = new Map<number, string[]>();
  for (const completion of completions) {
    const dates = datesByHabit.get(completion.habitId) ?? [];
    dates.push(completion.date);
    datesByHabit.set(completion.habitId, dates);
  }
  const habitStreaks = habits
    .map((habit) => {
      const dates = datesByHabit.get(habit.id) ?? [];
      return {
        habitId: habit.id,
        habitTitle: habit.title,
        currentStreak: currentStreak(dates),
        highestStreak: longestStreak(dates),
      };
    })
    .sort((left, right) => right.highestStreak - left.highestStreak);
  const profile = makeProfile(
    balances.xp,
    balances.gold,
    currentStreak(completions.map((item) => item.date)),
  );
  return {
    username: user[0]?.username ?? "adventurer",
    avatarId: (user[0]?.selectedAvatar ?? "novice") as AvatarId,
    level: profile.level,
    xp: profile.xp,
    gold: profile.gold,
    lifetimeTasksVanquished: balances.lifetimeTasksVanquished,
    highestHabitStreak: Math.max(
      0,
      ...habitStreaks.map((habit) => habit.highestStreak),
    ),
    habitStreaks,
    avatars: AVATARS.map((avatar) => ({
      ...avatar,
      unlocked: profile.level >= avatar.requiredLevel,
    })),
    milestones: milestones.map((milestone) => ({
      id: milestone.key,
      title: milestone.title,
      description: milestone.description,
      achievedAt: milestone.achievedAt,
    })),
  };
}

function rewardMultiplier(streak: number): number {
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

async function addMilestone(
  userId: string,
  key: string,
  title: string,
  description: string,
): Promise<void> {
  await db
    .insert(playerMilestonesTable)
    .values({ userId, key, title, description })
    .onConflictDoNothing();
}

async function bumpXp(userId: string, amount: number): Promise<void> {
  const before = await readBalances(userId);
  await db
    .update(playerProfileTable)
    .set({
      xp: sql`${playerProfileTable.xp} + ${amount}`,
      gold: sql`${playerProfileTable.gold} + ${amount}`,
    })
    .where(eq(playerProfileTable.userId, userId));

  const after = await readBalances(userId);
  const previousLevel = levelForXp(before.xp).level;
  const newLevel = levelForXp(after.xp).level;
  if (newLevel > previousLevel) {
    for (const avatar of AVATARS.slice(1)) {
      if (previousLevel < avatar.requiredLevel && newLevel >= avatar.requiredLevel) {
        await addMilestone(
          userId,
          `level-${avatar.requiredLevel}`,
          `Level ${avatar.requiredLevel}: ${avatar.name} unlocked`,
          `${avatar.description}`,
        );
      }
    }
    if (avatarForLevel(newLevel) !== avatarForLevel(previousLevel)) {
      await db
        .update(pixelQuestUsersTable)
        .set({ selectedAvatar: avatarForLevel(newLevel) })
        .where(eq(pixelQuestUsersTable.id, userId));
    }
  }
}

async function revokeXp(userId: string, amount: number): Promise<void> {
  await db
    .update(playerProfileTable)
    .set({
      xp: sql`GREATEST(0, ${playerProfileTable.xp} - ${amount})`,
      gold: sql`GREATEST(0, ${playerProfileTable.gold} - ${amount})`,
    })
    .where(eq(playerProfileTable.userId, userId));
  const { xp } = await readBalances(userId);
  const [user] = await db.select().from(pixelQuestUsersTable).where(eq(pixelQuestUsersTable.id, userId)).limit(1);
  const selected = AVATARS.find((avatar) => avatar.id === user?.selectedAvatar);
  if (selected && selected.requiredLevel > levelForXp(xp).level) {
    await db.update(pixelQuestUsersTable).set({ selectedAvatar: avatarForLevel(levelForXp(xp).level) }).where(eq(pixelQuestUsersTable.id, userId));
  }
}

function mapHabit(row: typeof habitsTable.$inferSelect, completedDates: string[]) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    frequency: row.frequency as "daily" | "weekly",
    days: row.days,
    archived: row.archived,
    createdAt: row.createdAt,
    completedDates,
  };
}

function mapTask(row: typeof questTasksTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    difficulty: row.difficulty as Difficulty,
    category: row.category,
    priority: row.priority,
    status: row.status as "active" | "completed",
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function mapReward(
  row: typeof rewardsTable.$inferSelect,
  currentValue: number,
  habitTitle: string | null,
) {
  const ruleType = row.ruleType as RewardRule;
  const status = row.claimedAt
    ? "claimed"
    : currentValue >= row.target
      ? "ready"
      : "locked";
  const displayedValue =
    status === "claimed" ? row.target : Math.min(currentValue, row.target);
  const unit =
    ruleType === "streak" ? "days" : ruleType === "gold" ? "Gold" : "level";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    ruleType,
    target: row.target,
    habitId: row.habitId,
    habitTitle,
    currentValue: displayedValue,
    progressText:
      status === "claimed"
        ? "CLAIMED"
        : `${displayedValue} / ${row.target} ${unit}`,
    status,
    claimedAt: row.claimedAt,
    createdAt: row.createdAt,
  };
}

function rewardCurrentValue(
  row: typeof rewardsTable.$inferSelect,
  profile: ReturnType<typeof makeProfile>,
  datesByHabit: Map<number, string[]>,
): number {
  if (row.ruleType === "gold") return profile.gold;
  if (row.ruleType === "level") return profile.level;
  if (row.ruleType === "streak" && row.habitId) {
    return currentStreak(datesByHabit.get(row.habitId) ?? []);
  }
  return 0;
}

async function rewardRuleError(
  userId: string,
  ruleType: RewardRule,
  target: number,
  habitId: number | null,
): Promise<string | null> {
  if (ruleType === "streak") {
    if (!habitId) return "Choose an active habit for a streak reward.";
    if (target > 3650) return "Streak targets cannot exceed 3,650 days.";
    const [habit] = await db
      .select({ id: habitsTable.id })
      .from(habitsTable)
      .where(
        and(
          eq(habitsTable.id, habitId),
          eq(habitsTable.userId, userId),
          eq(habitsTable.archived, false),
        ),
      )
      .limit(1);
    if (!habit) return "Choose an active habit for a streak reward.";
    return null;
  }
  if (habitId !== null) return "Only streak rewards can be linked to a habit.";
  if (ruleType === "level" && target > 100) {
    return "Level targets cannot exceed level 100.";
  }
  return null;
}

router.get("/pixelquest/dashboard", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const [profile, habits, tasks, completions, taskEvents, habitEvents] =
    await Promise.all([
      getPlayerProfile(userId),
      db
        .select()
        .from(habitsTable)
        .where(
          and(
            eq(habitsTable.userId, userId),
            eq(habitsTable.archived, false),
          ),
        ),
      db
        .select()
        .from(questTasksTable)
        .where(eq(questTasksTable.userId, userId)),
      db
        .select()
        .from(habitCompletionsTable)
        .where(eq(habitCompletionsTable.userId, userId)),
      db
        .select({
          title: questTasksTable.title,
          happenedAt: questTasksTable.completedAt,
        })
        .from(questTasksTable)
        .where(
          and(
            eq(questTasksTable.userId, userId),
            eq(questTasksTable.status, "completed"),
          ),
        ),
      db
        .select({
          title: habitsTable.title,
          happenedAt: habitCompletionsTable.completedAt,
        })
        .from(habitCompletionsTable)
        .innerJoin(
          habitsTable,
          eq(habitCompletionsTable.habitId, habitsTable.id),
        )
        .where(eq(habitCompletionsTable.userId, userId)),
    ]);

  const today = utcToday();
  const todayDow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const scheduledToday = habits.filter(
    (habit) =>
      habit.frequency === "daily" || habit.days.includes(todayDow),
  );
  const doneToday = new Set(
    completions
      .filter((completion) => completion.date === today)
      .map((completion) => completion.habitId),
  );
  const completionRate = scheduledToday.length
    ? Math.round((doneToday.size / scheduledToday.length) * 100)
    : 0;

  const recentActivity = [
    ...taskEvents
      .filter((event) => event.happenedAt)
      .map((event, index) => ({
        id: `task-${index}-${event.happenedAt?.getTime() ?? 0}`,
        label: event.title,
        kind: "task" as const,
        happenedAt: event.happenedAt as Date,
      })),
    ...habitEvents.map((event, index) => ({
      id: `habit-${index}-${event.happenedAt.getTime()}`,
      label: event.title,
      kind: "habit" as const,
      happenedAt: event.happenedAt,
    })),
  ]
    .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())
    .slice(0, 8);

  res.json(
    GetPixelQuestDashboardResponse.parse({
      profile,
      completedTasks: tasks.filter((task) => task.status === "completed")
        .length,
      activeHabits: habits.length,
      completionRate,
      totalCompletions: completions.length,
      recentActivity,
    }),
  );
});

router.get("/pixelquest/profile", async (req, res): Promise<void> => {
  const profile = await getProfileDetails(getUserId(req));
  res.json(GetPixelQuestProfileResponse.parse(profile));
});

router.patch("/pixelquest/profile", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = UpdatePixelQuestProfileBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({
      error: parsed.success
        ? "Choose a username or avatar to update."
        : parsed.error.message,
    });
    return;
  }

  const updates: Partial<typeof pixelQuestUsersTable.$inferInsert> = {};
  if (parsed.data.username !== undefined) {
    const username = parsed.data.username.trim();
    const [taken] = await db
      .select({ id: pixelQuestUsersTable.id })
      .from(pixelQuestUsersTable)
      .where(
        and(
          sql`lower(${pixelQuestUsersTable.username}) = ${username.toLowerCase()}`,
          sql`${pixelQuestUsersTable.id} <> ${userId}`,
        ),
      )
      .limit(1);
    if (taken) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    updates.username = username;
  }
  if (parsed.data.avatarId !== undefined) {
    const avatar = AVATARS.find((item) => item.id === parsed.data.avatarId);
    const { xp } = await readBalances(userId);
    if (!avatar || levelForXp(xp).level < avatar.requiredLevel) {
      res.status(409).json({ error: "Reach the required level to use that avatar." });
      return;
    }
    updates.selectedAvatar = avatar.id;
  }

  try {
    await db
      .update(pixelQuestUsersTable)
      .set(updates)
      .where(eq(pixelQuestUsersTable.id, userId));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    throw error;
  }
  res.json(
    UpdatePixelQuestProfileResponse.parse(await getProfileDetails(userId)),
  );
});
router.get("/pixelquest/habits", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rawArchived = req.query.archived;
  const parsed = GetHabitsQueryParams.safeParse({
    ...(rawArchived === undefined
      ? {}
      : { archived: rawArchived === "true" }),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const archived = parsed.data.archived ?? false;
  const [habits, completions] = await Promise.all([
    db
      .select()
      .from(habitsTable)
      .where(and(eq(habitsTable.userId, userId), eq(habitsTable.archived, archived)))
      .orderBy(desc(habitsTable.createdAt)),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable)
      .where(eq(habitCompletionsTable.userId, userId)),
  ]);
  const byHabit = new Map<number, string[]>();
  for (const completion of completions) {
    const dates = byHabit.get(completion.habitId) ?? [];
    dates.push(completion.date);
    byHabit.set(completion.habitId, dates);
  }
  res.json(
    GetHabitsResponse.parse(
      habits.map((habit) => mapHabit(habit, byHabit.get(habit.id) ?? [])),
    ),
  );
});

router.post("/pixelquest/habits", async (req, res): Promise<void> => {
  const parsed = CreateHabitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [habit] = await db
    .insert(habitsTable)
    .values({ ...parsed.data, userId: getUserId(req) })
    .returning();
  res.status(201).json(CreateHabitResponse.parse(mapHabit(habit, [])));
});

router.patch(
  "/pixelquest/habits/:habitId",
  async (req, res): Promise<void> => {
    const params = UpdateHabitParams.safeParse(req.params);
    const parsed = UpdateHabitBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      const error = !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid input";
      res.status(400).json({
        error,
      });
      return;
    }
    const [habit] = await db
      .update(habitsTable)
      .set(parsed.data)
      .where(and(eq(habitsTable.id, params.data.habitId), eq(habitsTable.userId, getUserId(req))))
      .returning();
    if (!habit) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }
    const completions = await db
      .select({ date: habitCompletionsTable.date })
      .from(habitCompletionsTable)
      .where(eq(habitCompletionsTable.habitId, habit.id));
    res.json(
      UpdateHabitResponse.parse(
        mapHabit(
          habit,
          completions.map((completion) => completion.date),
        ),
      ),
    );
  },
);

router.put(
  "/pixelquest/habits/:habitId/completions",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = CompleteHabitParams.safeParse(req.params);
    const parsed = CompleteHabitBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      const error = !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid input";
      res.status(400).json({
        error,
      });
      return;
    }

    const date = asDateString(parsed.data.date);
    const [habit] = await db
      .select()
      .from(habitsTable)
      .where(
        and(
          eq(habitsTable.id, params.data.habitId),
          eq(habitsTable.userId, userId),
          eq(habitsTable.archived, false),
        ),
      )
      .limit(1);
    if (!habit) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }

    const { xp: xpBefore } = await readBalances(userId);
    const [allDates, existing] = await Promise.all([
      readHabitDates(userId),
      db
        .select({ id: habitCompletionsTable.id })
        .from(habitCompletionsTable)
        .where(
          and(
            eq(habitCompletionsTable.habitId, habit.id),
            eq(habitCompletionsTable.date, date),
          ),
        )
        .limit(1),
    ]);
    let xpEarned = 0;
    if (!existing.length) {
      const streak = currentStreak([...allDates, date]);
      const multiplier = rewardMultiplier(streak);
      xpEarned = Math.round(BASE_XP * multiplier);
      const inserted = await db
        .insert(habitCompletionsTable)
        .values({ userId, habitId: habit.id, date, xpAwarded: xpEarned })
        .onConflictDoNothing()
        .returning({ id: habitCompletionsTable.id });
      if (inserted.length) {
        await bumpXp(userId, xpEarned);
        const habitDates = await db.select({date: habitCompletionsTable.date}).from(habitCompletionsTable).where(and(eq(habitCompletionsTable.userId, userId), eq(habitCompletionsTable.habitId, habit.id)));
        const streak = currentStreak(habitDates.map((item) => item.date));
        for (const target of [3, 7, 14, 30]) {
          if (streak >= target) await addMilestone(userId, `habit-${habit.id}-streak-${target}`, `${target}-day streak`, `${habit.title}: ${target} consecutive days completed.`);
        }
      }
      else xpEarned = 0;
    }
    const profile = await getPlayerProfile(userId);
    const response = {
      xpEarned,
      profile,
      leveledUp: levelForXp(xpBefore).level < profile.level,
      multiplier: xpEarned ? rewardMultiplier(profile.streak) : 1,
    };
    res.json(CompleteHabitResponse.parse(response));
  },
);

router.delete(
  "/pixelquest/habits/:habitId/completions",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = UndoHabitCompletionParams.safeParse(req.params);
    const parsed = UndoHabitCompletionBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      const error = !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid input";
      res.status(400).json({
        error,
      });
      return;
    }
    const date = asDateString(parsed.data.date);
    const [completion] = await db
      .select()
      .from(habitCompletionsTable)
      .where(
        and(
          eq(habitCompletionsTable.habitId, params.data.habitId),
          eq(habitCompletionsTable.userId, userId),
          eq(habitCompletionsTable.date, date),
        ),
      )
      .limit(1);
    if (!completion) {
      res.status(404).json({ error: "Completion not found" });
      return;
    }
    const deleted = await db
      .delete(habitCompletionsTable)
      .where(eq(habitCompletionsTable.id, completion.id))
      .returning({ id: habitCompletionsTable.id });
    if (deleted.length) await revokeXp(userId, completion.xpAwarded);
    res.sendStatus(204);
  },
);

router.get("/pixelquest/tasks", async (req, res): Promise<void> => {
  const parsed = GetTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [eq(questTasksTable.userId, getUserId(req))];
  if (parsed.data.status && parsed.data.status !== "all") {
    conditions.push(eq(questTasksTable.status, parsed.data.status));
  }
  if (parsed.data.difficulty) {
    conditions.push(eq(questTasksTable.difficulty, parsed.data.difficulty));
  }
  const tasks = await db
    .select()
    .from(questTasksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(questTasksTable.createdAt));
  res.json(GetTasksResponse.parse(tasks.map(mapTask)));
});

router.post("/pixelquest/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .insert(questTasksTable)
    .values({
      ...parsed.data,
      userId: getUserId(req),
      dueDate: parsed.data.dueDate
        ? asDateString(parsed.data.dueDate)
        : null,
    })
    .returning();
  res.status(201).json(CreateTaskResponse.parse(mapTask(task)));
});

router.patch(
  "/pixelquest/tasks/:taskId",
  async (req, res): Promise<void> => {
    const params = UpdateTaskParams.safeParse(req.params);
    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: params.error?.message ?? parsed.error?.message ?? "Invalid input",
      });
      return;
    }
    const { dueDate, ...otherUpdates } = parsed.data;
    const update: Partial<typeof questTasksTable.$inferInsert> = {
      ...otherUpdates,
      ...(dueDate !== undefined
        ? { dueDate: dueDate ? asDateString(dueDate) : null }
        : {}),
    };
    const [task] = await db
      .update(questTasksTable)
      .set(update)
      .where(and(eq(questTasksTable.id, params.data.taskId), eq(questTasksTable.userId, getUserId(req))))
      .returning();
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(UpdateTaskResponse.parse(mapTask(task)));
  },
);

router.delete(
  "/pixelquest/tasks/:taskId",
  async (req, res): Promise<void> => {
    const params = DeleteTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .delete(questTasksTable)
      .where(and(eq(questTasksTable.id, params.data.taskId), eq(questTasksTable.userId, getUserId(req))))
      .returning();
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.put(
  "/pixelquest/tasks/:taskId/completion",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = CompleteTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .select()
      .from(questTasksTable)
      .where(and(eq(questTasksTable.id, params.data.taskId), eq(questTasksTable.userId, userId)))
      .limit(1);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const { xp: xpBefore } = await readBalances(userId);
    let xpEarned = 0;
    if (task.status !== "completed") {
      xpEarned = TASK_XP[task.difficulty as Difficulty] ?? TASK_XP.medium;
      const updated = await db
        .update(questTasksTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          xpAwarded: xpEarned,
        })
        .where(and(eq(questTasksTable.id, task.id), eq(questTasksTable.status, "active")))
        .returning({ id: questTasksTable.id });
      if (updated.length) {
        await bumpXp(userId, xpEarned);
        const [player] = await db.update(playerProfileTable).set({ lifetimeTasksVanquished: sql`${playerProfileTable.lifetimeTasksVanquished} + 1` }).where(eq(playerProfileTable.userId, userId)).returning({ count: playerProfileTable.lifetimeTasksVanquished });
        for (const target of [1, 10, 50, 100]) {
          if (player.count >= target) await addMilestone(userId, `tasks-${target}`, `${target} quests vanquished`, `Completed ${target} lifetime quests.`);
        }
      } else xpEarned = 0;
    }
    const profile = await getPlayerProfile(userId);
    res.json(
      CompleteTaskResponse.parse({
        xpEarned,
        profile,
        leveledUp: levelForXp(xpBefore).level < profile.level,
        multiplier: 1,
      }),
    );
  },
);

router.delete(
  "/pixelquest/tasks/:taskId/completion",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = UndoTaskCompletionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .select()
      .from(questTasksTable)
      .where(and(eq(questTasksTable.id, params.data.taskId), eq(questTasksTable.userId, userId)))
      .limit(1);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.status === "completed") {
      const updated = await db
        .update(questTasksTable)
        .set({ status: "active", completedAt: null, xpAwarded: 0 })
        .where(and(eq(questTasksTable.id, task.id), eq(questTasksTable.status, "completed")))
        .returning({ id: questTasksTable.id });
      if (updated.length) await revokeXp(userId, task.xpAwarded);
    }
    const [updatedTask] = await db
      .select()
      .from(questTasksTable)
      .where(eq(questTasksTable.id, task.id))
      .limit(1);
    res.json(UndoTaskCompletionResponse.parse(mapTask(updatedTask)));
  },
);

router.get("/pixelquest/achievements", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const [tasks, completions, profile] = await Promise.all([
    db.select().from(questTasksTable).where(and(eq(questTasksTable.userId, userId), eq(questTasksTable.status, "completed"))),
    db.select().from(habitCompletionsTable).where(eq(habitCompletionsTable.userId, userId)).orderBy(habitCompletionsTable.completedAt),
    getPlayerProfile(userId),
  ]);
  const sortedTasks = tasks.sort(
    (a, b) =>
      (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0),
  );
  const milestones = [
    {
      id: "first-blood",
      name: "First Blood",
      description: "Complete your first quest.",
      unlocked: sortedTasks.length >= 1,
      unlockedAt: sortedTasks[0]?.completedAt ?? null,
    },
    {
      id: "habit-starter",
      name: "First Steps",
      description: "Complete a habit for the first time.",
      unlocked: completions.length >= 1,
      unlockedAt: completions[0]?.completedAt ?? null,
    },
    {
      id: "iron-will",
      name: "Iron Will",
      description: "Keep a seven-day habit streak.",
      unlocked: profile.streak >= 7,
      unlockedAt: profile.streak >= 7 ? completions.at(-1)?.completedAt ?? null : null,
    },
    {
      id: "quest-collector",
      name: "Quest Collector",
      description: "Complete ten quests.",
      unlocked: sortedTasks.length >= 10,
      unlockedAt: sortedTasks[9]?.completedAt ?? null,
    },
    {
      id: "habit-paladin",
      name: "Habit Paladin",
      description: "Reach level 10.",
      unlocked: profile.level >= 10,
      unlockedAt: profile.level >= 10 ? sortedTasks.at(-1)?.completedAt ?? completions.at(-1)?.completedAt ?? null : null,
    },
  ];
  res.json(GetAchievementsResponse.parse(milestones));
});

router.get("/pixelquest/rewards", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const [rows, profile, completions, habits] = await Promise.all([
    db.select().from(rewardsTable).where(eq(rewardsTable.userId, userId)).orderBy(desc(rewardsTable.createdAt)),
    getPlayerProfile(userId),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable)
      .where(eq(habitCompletionsTable.userId, userId)),
    db.select({ id: habitsTable.id, title: habitsTable.title }).from(habitsTable).where(eq(habitsTable.userId, userId)),
  ]);
  const datesByHabit = new Map<number, string[]>();
  for (const completion of completions) {
    const dates = datesByHabit.get(completion.habitId) ?? [];
    dates.push(completion.date);
    datesByHabit.set(completion.habitId, dates);
  }
  const habitTitles = new Map(habits.map((habit) => [habit.id, habit.title]));
  res.json(
    GetRewardsResponse.parse(
      rows.map((row) =>
        mapReward(
          row,
          rewardCurrentValue(row, profile, datesByHabit),
          row.habitId ? habitTitles.get(row.habitId) ?? null : null,
        ),
      ),
    ),
  );
});

router.post("/pixelquest/rewards", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateRewardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validationError = await rewardRuleError(
    userId,
    parsed.data.ruleType,
    parsed.data.target,
    parsed.data.habitId,
  );
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const [row] = await db
    .insert(rewardsTable)
    .values({ ...parsed.data, userId })
    .returning();
  const [profile, completions] = await Promise.all([
    getPlayerProfile(userId),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable)
      .where(eq(habitCompletionsTable.userId, userId)),
  ]);
  const datesByHabit = new Map<number, string[]>();
  for (const completion of completions) {
    const dates = datesByHabit.get(completion.habitId) ?? [];
    dates.push(completion.date);
    datesByHabit.set(completion.habitId, dates);
  }
  const [habit] = row.habitId
    ? await db
        .select({ title: habitsTable.title })
        .from(habitsTable)
        .where(eq(habitsTable.id, row.habitId))
        .limit(1)
    : [];
  res.status(201).json(
    CreateRewardResponse.parse(
      mapReward(
        row,
        rewardCurrentValue(row, profile, datesByHabit),
        habit?.title ?? null,
      ),
    ),
  );
});

router.patch(
  "/pixelquest/rewards/:rewardId",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = UpdateRewardParams.safeParse(req.params);
    const parsed = UpdateRewardBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: params.error?.message ?? parsed.error?.message ?? "Invalid input",
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(rewardsTable)
      .where(and(eq(rewardsTable.id, params.data.rewardId), eq(rewardsTable.userId, userId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Reward not found" });
      return;
    }
    if (existing.claimedAt) {
      res.status(409).json({ error: "Claimed rewards cannot be edited." });
      return;
    }

    const ruleType = parsed.data.ruleType ?? (existing.ruleType as RewardRule);
    const target = parsed.data.target ?? existing.target;
    const habitId =
      parsed.data.habitId === undefined ? existing.habitId : parsed.data.habitId;
    const validationError = await rewardRuleError(userId, ruleType, target, habitId);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const [row] = await db
      .update(rewardsTable)
      .set(parsed.data)
      .where(and(eq(rewardsTable.id, existing.id), isNull(rewardsTable.claimedAt)))
      .returning();
    if (!row) {
      res.status(409).json({ error: "Claimed rewards cannot be edited." });
      return;
    }
    const [profile, completions] = await Promise.all([
      getPlayerProfile(userId),
      db
        .select({
          habitId: habitCompletionsTable.habitId,
          date: habitCompletionsTable.date,
        })
        .from(habitCompletionsTable)
        .where(eq(habitCompletionsTable.userId, userId)),
    ]);
    const datesByHabit = new Map<number, string[]>();
    for (const completion of completions) {
      const dates = datesByHabit.get(completion.habitId) ?? [];
      dates.push(completion.date);
      datesByHabit.set(completion.habitId, dates);
    }
    const [habit] = row.habitId
      ? await db
          .select({ title: habitsTable.title })
          .from(habitsTable)
          .where(eq(habitsTable.id, row.habitId))
          .limit(1)
      : [];
    res.json(
      UpdateRewardResponse.parse(
        mapReward(
          row,
          rewardCurrentValue(row, profile, datesByHabit),
          habit?.title ?? null,
        ),
      ),
    );
  },
);

router.delete(
  "/pixelquest/rewards/:rewardId",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = DeleteRewardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(rewardsTable)
      .where(
        and(
          eq(rewardsTable.id, params.data.rewardId),
          eq(rewardsTable.userId, userId),
          isNull(rewardsTable.claimedAt),
        ),
      )
      .returning({ id: rewardsTable.id });
    if (!row) {
      const [existing] = await db
        .select({ id: rewardsTable.id })
        .from(rewardsTable)
        .where(and(eq(rewardsTable.id, params.data.rewardId), eq(rewardsTable.userId, userId)))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Reward not found" });
        return;
      }
      res.status(409).json({ error: "Claimed rewards cannot be deleted." });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/pixelquest/rewards/:rewardId/claim",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = ClaimRewardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      const [reward] = await tx
        .select()
        .from(rewardsTable)
        .where(and(eq(rewardsTable.id, params.data.rewardId), eq(rewardsTable.userId, userId)))
        .limit(1)
        .for("update");
      if (!reward) return { kind: "not-found" as const };
      if (reward.claimedAt) return { kind: "claimed" as const };

      const [player] = await tx
        .select({
          xp: playerProfileTable.xp,
          gold: playerProfileTable.gold,
        })
        .from(playerProfileTable)
        .where(eq(playerProfileTable.userId, userId))
        .limit(1);
      let currentValue = 0;
      if (reward.ruleType === "gold") {
        currentValue = player?.gold ?? 0;
      } else if (reward.ruleType === "level") {
        currentValue = levelForXp(player?.xp ?? 0).level;
      } else if (reward.ruleType === "streak" && reward.habitId) {
        const rows = await tx
          .select({ date: habitCompletionsTable.date })
          .from(habitCompletionsTable)
          .where(eq(habitCompletionsTable.habitId, reward.habitId));
        currentValue = currentStreak(rows.map((item) => item.date));
      }
      if (currentValue < reward.target) return { kind: "locked" as const };

      if (reward.ruleType === "gold") {
        const [balance] = await tx
          .update(playerProfileTable)
          .set({ gold: sql`${playerProfileTable.gold} - ${reward.target}` })
          .where(
            and(
              eq(playerProfileTable.userId, userId),
              gte(playerProfileTable.gold, reward.target),
            ),
          )
          .returning({ gold: playerProfileTable.gold });
        if (!balance) return { kind: "locked" as const };
      }
      const [claimed] = await tx
        .update(rewardsTable)
        .set({ claimedAt: new Date() })
        .where(
          and(eq(rewardsTable.id, reward.id), isNull(rewardsTable.claimedAt)),
        )
        .returning();
      if (!claimed) throw new Error("Reward was claimed concurrently.");
      return { kind: "claimed" as const, reward: claimed };
    });

    if (outcome.kind === "not-found") {
      res.status(404).json({ error: "Reward not found" });
      return;
    }
    if (outcome.kind === "claimed") {
      const claimedReward = "reward" in outcome ? outcome.reward : undefined;
      if (claimedReward) {
        const [habit] = claimedReward.habitId
          ? await db
              .select({ title: habitsTable.title })
              .from(habitsTable)
              .where(eq(habitsTable.id, claimedReward.habitId))
              .limit(1)
          : [];
        res.json(
          ClaimRewardResponse.parse(
            mapReward(claimedReward, claimedReward.target, habit?.title ?? null),
          ),
        );
        return;
      }
      res.status(409).json({ error: "This reward has already been claimed." });
      return;
    }
    res.status(409).json({ error: "This reward is still locked." });
  },
);

export default router;
