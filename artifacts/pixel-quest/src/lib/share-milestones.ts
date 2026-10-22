import type { RpgSnapshot } from '@workspace/api-client-react';

export type ShareMilestoneType = 'level' | 'streak' | 'reward' | 'boss' | 'quest' | 'player';

export interface ShareMilestone {
  id: string;
  type: ShareMilestoneType;
  headline: string;
  detail: string;
}

export type ShareCardAspect = 'story' | 'square';

const STREAK_TARGETS = [7, 14, 30, 60, 100] as const;

export function discoverNewlyReadyRewards(snapshot: RpgSnapshot, previouslySeen: ReadonlySet<number>) {
  return snapshot.rewards.filter(reward => reward.status === 'ready' && !previouslySeen.has(reward.id));
}

/** Find only milestones caused by this committed RPG action, not the initial account snapshot. */
export function discoverShareMilestones(previous: RpgSnapshot, next: RpgSnapshot): ShareMilestone[] {
  const found: ShareMilestone[] = [];
  if (next.profile.level > previous.profile.level) {
    found.push({
      id: `level:${next.profile.level}`,
      type: 'level',
      headline: `Level ${next.profile.level} reached`,
      detail: `${next.profile.username} reached a new player level.`,
    });
  }

  for (const streak of next.profile.habitStreaks) {
    const old = previous.profile.habitStreaks.find(item => item.habitId === streak.habitId)?.currentStreak ?? 0;
    for (const target of STREAK_TARGETS) {
      if (old < target && streak.currentStreak >= target) {
        found.push({
          id: `streak:${streak.habitId}:${target}:${next.today}`,
          type: 'streak',
          headline: `${target}-Day Discipline Streak`,
          detail: `${streak.habitTitle} reached ${target} consecutive days.`,
        });
      }
    }
  }

  const priorQuests = new Map(previous.quests.map(quest => [quest.id, quest.status]));
  for (const quest of next.quests) {
    if (quest.difficulty === 'hard' && quest.status === 'completed' && priorQuests.get(quest.id) !== 'completed') {
      found.push({
        id: `quest:${quest.id}`,
        type: 'quest',
        headline: 'High-Tier Quest Vanquished',
        detail: quest.title,
      });
    }
  }

  const priorBosses = new Map(previous.bosses.map(boss => [boss.id, boss.defeated]));
  for (const boss of next.bosses) {
    if (boss.defeated && !priorBosses.get(boss.id)) {
      found.push({
        id: `boss:${boss.id}`,
        type: 'boss',
        headline: 'Boss Defeated',
        detail: boss.name,
      });
    }
  }

  return found;
}
