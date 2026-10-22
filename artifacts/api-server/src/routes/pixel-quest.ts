import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CompleteHabitBody,
  CompleteHabitParams,
  CompleteHabitResponse,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateHabitBody,
  CreateHabitResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  GetAchievementsResponse,
  GetHabitsQueryParams,
  GetHabitsResponse,
  GetPixelQuestDashboardResponse,
  GetTasksQueryParams,
  GetTasksResponse,
  HabitCompletionUndoInput,
  UndoHabitCompletionBody,
  UndoHabitCompletionParams,
  UndoTaskCompletionParams,
  UndoTaskCompletionResponse,
  UpdateHabitBody,
  UpdateHabitParams,
  UpdateHabitResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  db,
  habitCompletionsTable,
  habitsTable,
  playerProfileTable,
  questTasksTable,
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

function makeProfile(xp: number, streak: number) {
  const progress = levelForXp(xp);
  return {
    xp,
    ...progress,
    streak,
    title: playerTitle(progress.level),
  };
}

async function readXp(): Promise<number> {
  const [player] = await db
    .select({ xp: playerProfileTable.xp })
    .from(playerProfileTable)
    .where(eq(playerProfileTable.id, 1))
    .limit(1);
  return player?.xp ?? 0;
}

async function readHabitDates(): Promise<string[]> {
  const rows = await db
    .select({ date: habitCompletionsTable.date })
    .from(habitCompletionsTable);
  return rows.map((row) => row.date);
}

async function getPlayerProfile() {
  const [xp, dates] = await Promise.all([readXp(), readHabitDates()]);
  return makeProfile(xp, currentStreak(dates));
}

function rewardMultiplier(streak: number): number {
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

async function bumpXp(amount: number): Promise<void> {
  await db
    .insert(playerProfileTable)
    .values({ id: 1, xp: amount })
    .onConflictDoUpdate({
      target: playerProfileTable.id,
      set: { xp: sql`${playerProfileTable.xp} + ${amount}` },
    });
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

    const xpBefore = await readXp();
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
    await db
      .update(playerProfileTable)
      .set({
        xp: sql`GREATEST(0, ${playerProfileTable.xp} - ${completion.xpAwarded})`,
      })
      .where(eq(playerProfileTable.id, 1));
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
    const xpBefore = await readXp();
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
      await db
        .update(playerProfileTable)
        .set({
          xp: sql`GREATEST(0, ${playerProfileTable.xp} - ${task.xpAwarded})`,
        })
        .where(eq(playerProfileTable.id, 1));
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

export default router;
