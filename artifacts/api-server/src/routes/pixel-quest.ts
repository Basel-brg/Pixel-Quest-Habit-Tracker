import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
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
  questTasksTable,
  rewardsTable,
} from "@workspace/db";

const router: IRouter = Router();
const BASE_XP = 25;
const TASK_XP = { easy: 10, medium: 25, hard: 50 } as const;

type Difficulty = keyof typeof TASK_XP;

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

async function readBalances(): Promise<{ xp: number; gold: number }> {
  const [player] = await db
    .select({
      xp: playerProfileTable.xp,
      gold: playerProfileTable.gold,
    })
    .from(playerProfileTable)
    .where(eq(playerProfileTable.id, 1))
    .limit(1);
  return { xp: player?.xp ?? 0, gold: player?.gold ?? 0 };
}

async function readHabitDates(): Promise<string[]> {
  const rows = await db
    .select({ date: habitCompletionsTable.date })
    .from(habitCompletionsTable);
  return rows.map((row) => row.date);
}

async function getPlayerProfile() {
  const [balances, dates] = await Promise.all([readBalances(), readHabitDates()]);
  return makeProfile(balances.xp, balances.gold, currentStreak(dates));
}

function rewardMultiplier(streak: number): number {
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

async function bumpXp(amount: number): Promise<void> {
  await db
    .insert(playerProfileTable)
    .values({ id: 1, xp: amount, gold: amount })
    .onConflictDoUpdate({
      target: playerProfileTable.id,
      set: {
        xp: sql`${playerProfileTable.xp} + ${amount}`,
        gold: sql`${playerProfileTable.gold} + ${amount}`,
      },
    });
}

async function revokeXp(amount: number): Promise<void> {
  await db
    .update(playerProfileTable)
    .set({
      xp: sql`GREATEST(0, ${playerProfileTable.xp} - ${amount})`,
      gold: sql`GREATEST(0, ${playerProfileTable.gold} - ${amount})`,
    })
    .where(eq(playerProfileTable.id, 1));
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

type RewardRule = "streak" | "gold" | "level";

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
      .where(and(eq(habitsTable.id, habitId), eq(habitsTable.archived, false)))
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

router.get("/pixelquest/dashboard", async (_req, res): Promise<void> => {
  const [profile, habits, tasks, completions, taskEvents, habitEvents] =
    await Promise.all([
      getPlayerProfile(),
      db.select().from(habitsTable).where(eq(habitsTable.archived, false)),
      db.select().from(questTasksTable),
      db.select().from(habitCompletionsTable),
      db
        .select({
          title: questTasksTable.title,
          happenedAt: questTasksTable.completedAt,
        })
        .from(questTasksTable)
        .where(eq(questTasksTable.status, "completed")),
      db
        .select({
          title: habitsTable.title,
          happenedAt: habitCompletionsTable.completedAt,
        })
        .from(habitCompletionsTable)
        .innerJoin(
          habitsTable,
          eq(habitCompletionsTable.habitId, habitsTable.id),
        ),
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

router.get("/pixelquest/habits", async (req, res): Promise<void> => {
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
      .where(eq(habitsTable.archived, archived))
      .orderBy(desc(habitsTable.createdAt)),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable),
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
    .values(parsed.data)
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
      .where(eq(habitsTable.id, params.data.habitId))
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
          eq(habitsTable.archived, false),
        ),
      )
      .limit(1);
    if (!habit) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }

    const { xp: xpBefore } = await readBalances();
    const [allDates, existing] = await Promise.all([
      readHabitDates(),
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
        .values({ habitId: habit.id, date, xpAwarded: xpEarned })
        .onConflictDoNothing()
        .returning({ id: habitCompletionsTable.id });
      if (inserted.length) await bumpXp(xpEarned);
      else xpEarned = 0;
    }
    const profile = await getPlayerProfile();
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
          eq(habitCompletionsTable.date, date),
        ),
      )
      .limit(1);
    if (!completion) {
      res.status(404).json({ error: "Completion not found" });
      return;
    }
    await db
      .delete(habitCompletionsTable)
      .where(eq(habitCompletionsTable.id, completion.id));
    await revokeXp(completion.xpAwarded);
    res.sendStatus(204);
  },
);

router.get("/pixelquest/tasks", async (req, res): Promise<void> => {
  const parsed = GetTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [];
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
      .where(eq(questTasksTable.id, params.data.taskId))
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
      .where(eq(questTasksTable.id, params.data.taskId))
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
    const params = CompleteTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .select()
      .from(questTasksTable)
      .where(eq(questTasksTable.id, params.data.taskId))
      .limit(1);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const { xp: xpBefore } = await readBalances();
    let xpEarned = 0;
    if (task.status !== "completed") {
      xpEarned = TASK_XP[task.difficulty as Difficulty] ?? TASK_XP.medium;
      await db
        .update(questTasksTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          xpAwarded: xpEarned,
        })
        .where(eq(questTasksTable.id, task.id));
      await bumpXp(xpEarned);
    }
    const profile = await getPlayerProfile();
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
    const params = UndoTaskCompletionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .select()
      .from(questTasksTable)
      .where(eq(questTasksTable.id, params.data.taskId))
      .limit(1);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.status === "completed") {
      await db
        .update(questTasksTable)
        .set({ status: "active", completedAt: null, xpAwarded: 0 })
        .where(eq(questTasksTable.id, task.id));
      await revokeXp(task.xpAwarded);
    }
    const [updatedTask] = await db
      .select()
      .from(questTasksTable)
      .where(eq(questTasksTable.id, task.id))
      .limit(1);
    res.json(UndoTaskCompletionResponse.parse(mapTask(updatedTask)));
  },
);

router.get("/pixelquest/achievements", async (_req, res): Promise<void> => {
  const [tasks, completions, profile] = await Promise.all([
    db.select().from(questTasksTable).where(eq(questTasksTable.status, "completed")),
    db.select().from(habitCompletionsTable).orderBy(habitCompletionsTable.completedAt),
    getPlayerProfile(),
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

router.get("/pixelquest/rewards", async (_req, res): Promise<void> => {
  const [rows, profile, completions, habits] = await Promise.all([
    db.select().from(rewardsTable).orderBy(desc(rewardsTable.createdAt)),
    getPlayerProfile(),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable),
    db.select({ id: habitsTable.id, title: habitsTable.title }).from(habitsTable),
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
  const parsed = CreateRewardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validationError = await rewardRuleError(
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
    .values(parsed.data)
    .returning();
  const [profile, completions] = await Promise.all([
    getPlayerProfile(),
    db
      .select({
        habitId: habitCompletionsTable.habitId,
        date: habitCompletionsTable.date,
      })
      .from(habitCompletionsTable),
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
      .where(eq(rewardsTable.id, params.data.rewardId))
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
    const validationError = await rewardRuleError(ruleType, target, habitId);
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
      getPlayerProfile(),
      db
        .select({
          habitId: habitCompletionsTable.habitId,
          date: habitCompletionsTable.date,
        })
        .from(habitCompletionsTable),
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
          isNull(rewardsTable.claimedAt),
        ),
      )
      .returning({ id: rewardsTable.id });
    if (!row) {
      const [existing] = await db
        .select({ id: rewardsTable.id })
        .from(rewardsTable)
        .where(eq(rewardsTable.id, params.data.rewardId))
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
    const params = ClaimRewardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      const [reward] = await tx
        .select()
        .from(rewardsTable)
        .where(eq(rewardsTable.id, params.data.rewardId))
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
        .where(eq(playerProfileTable.id, 1))
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
              eq(playerProfileTable.id, 1),
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
