import { sql } from "drizzle-orm";
import { pixelQuestUsersTable, type db } from "@workspace/db";
import type { OnboardingDraft } from "@workspace/api-zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Deliberately independent of earned skill points and completion history. */
const presetPaths = {
  water: "STR", workout: "STR", read: "INT", study: "INT", meditate: "WIS", sleep: "WIS",
} as const;

export class OnboardingValidationError extends Error {}

export async function validateOnboardingDraft(tx: Tx, uid: string, draft: OnboardingDraft, final = false) {
  const fail = (message: string): never => { throw new OnboardingValidationError(message); };
  const d = { ...draft };
  if (d.username !== undefined) {
    d.username = d.username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(d.username)) fail("Hero username must use 3–20 letters, numbers or underscores.");
    const [taken] = await tx.select({ id: pixelQuestUsersTable.id }).from(pixelQuestUsersTable)
      .where(sql`lower(${pixelQuestUsersTable.username}) = lower(${d.username}) AND ${pixelQuestUsersTable.id} <> ${uid}`);
    if (taken) fail("That username is already taken.");
  }
  if (d.habitTitle !== undefined) d.habitTitle = d.habitTitle.trim();
  if (d.habitUnit !== undefined) d.habitUnit = d.habitUnit.trim();
  if (d.rewardTitle !== undefined) d.rewardTitle = d.rewardTitle.trim();
  if (d.habitPresetId && d.habitPresetId !== "custom" && presetPaths[d.habitPresetId] !== d.heroPath) {
    fail("Choose a habit preset that matches your hero path, or a custom habit.");
  }
  if (d.rewardPresetId === "coffee" && d.rewardStreak !== undefined && d.rewardStreak !== 3) {
    fail("Coffee requires Level 2 AND a three-day streak.");
  }
  if (d.rewardPresetId === "meal" && d.rewardStreak !== undefined && d.rewardStreak !== 5) {
    fail("The weekend meal requires Level 2 AND a five-day streak.");
  }
  const step = final ? 5 : d.step;
  if (step >= 2 && (!d.username || !d.themeId)) fail("Confirm your username and theme before continuing.");
  if (step >= 3 && !d.heroPath) fail("Choose a hero path before continuing.");
  if (step >= 4 && (!d.habitTitle || !d.habitPresetId || d.habitTarget === undefined)) {
    fail("Choose a preset or name your first daily habit and set its target.");
  }
  if (step >= 5 && (!d.rewardTitle || !d.rewardPresetId)) fail("Choose your first real-life reward.");
  // The default physical-item requirement is level 2 only, never a hidden streak.
  if (d.rewardPresetId) d.rewardStreak = d.rewardPresetId === "coffee" ? 3 : d.rewardPresetId === "meal" ? 5 : d.rewardStreak ?? 0;
  return d;
}
