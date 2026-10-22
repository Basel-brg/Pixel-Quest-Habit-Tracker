import type { QueryClient } from '@tanstack/react-query';
import {
  getGetAchievementsQueryKey,
  getGetHabitsQueryKey,
  getGetPixelQuestDashboardQueryKey,
  getGetTasksQueryKey,
  getGetRewardsQueryKey,
  getGetPixelQuestProfileQueryKey,
} from '@workspace/api-client-react';

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function isHabitScheduledToday(
  frequency: string,
  days: number[],
  date = new Date(),
): boolean {
  return frequency === 'daily' || days.includes(date.getDay());
}

export function invalidatePixelQuest(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: getGetRewardsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getGetPixelQuestProfileQueryKey() });
  void queryClient.invalidateQueries({
    queryKey: getGetPixelQuestDashboardQueryKey(),
  });
  void queryClient.invalidateQueries({ queryKey: getGetHabitsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getGetTasksQueryKey() });
  void queryClient.invalidateQueries({
    queryKey: getGetAchievementsQueryKey(),
  });
}
