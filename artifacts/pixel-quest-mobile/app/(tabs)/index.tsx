import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useGetAchievements, useGetHabits, useGetPixelQuestDashboard, useGetTasks, useCompleteHabit, useUndoHabitCompletion, useCompleteTask } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { dateKey, invalidatePixelQuest, isHabitScheduledToday, localDateKey } from '@/lib/pixel-quest';
import { EmptyState, ErrorState, LoadingState, MetaText, Panel, PixelBar, PixelPage, ScreenTitle, SectionHeading } from '@/components/PixelUI';
import { StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { VoiceCapture } from '@/components/VoiceCapture';

const difficultyColor = {
  easy: 'success',
  medium: 'cyan',
  hard: 'purple',
} as const;

function PixelAvatar() {
  const colors = useColors();
  const pattern = [
    '00100',
    '01110',
    '11111',
    '10101',
    '01110',
  ];
  return (
    <View style={[styles.avatar, { backgroundColor: colors.sidebar, borderColor: colors.border }]}>
      {pattern.map((row, rowIndex) => (
        <View key={`avatar-row-${rowIndex}`} style={styles.avatarRow}>
          {row.split('').map((cell, columnIndex) => (
            <View
              key={`avatar-pixel-${rowIndex}-${columnIndex}`}
              style={[
                styles.avatarPixel,
                {
                  backgroundColor:
                    cell === '0'
                      ? 'transparent'
                      : rowIndex === 1
                        ? colors.cyan
                        : rowIndex === 3 && (columnIndex === 1 || columnIndex === 3)
                          ? colors.background
                          : colors.gold,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function TodayScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const dashboardQuery = useGetPixelQuestDashboard();
  const habitsQuery = useGetHabits();
  const tasksQuery = useGetTasks({ status: 'active' });
  const achievementsQuery = useGetAchievements();
  const completeHabit = useCompleteHabit();
  const undoHabit = useUndoHabitCompletion();
  const completeTask = useCompleteTask();
  const today = localDateKey();

  const reload = () => {
    void Promise.all([
      dashboardQuery.refetch(),
      habitsQuery.refetch(),
      tasksQuery.refetch(),
      achievementsQuery.refetch(),
    ]);
  };
  const mutationSuccess = () => {
    invalidatePixelQuest(queryClient);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (
    dashboardQuery.isLoading ||
    habitsQuery.isLoading ||
    tasksQuery.isLoading ||
    achievementsQuery.isLoading
  ) {
    return (
      <PixelPage>
        <LoadingState />
      </PixelPage>
    );
  }

  const queryError =
    dashboardQuery.error ||
    habitsQuery.error ||
    tasksQuery.error ||
    achievementsQuery.error;
  if (queryError) {
    return (
      <PixelPage>
        <ScreenTitle eyebrow="PIXEL QUEST" title="TODAY" subtitle="Your next small win is ready." />
        <ErrorState
          message={queryError instanceof Error ? queryError.message : 'Could not load your quest data.'}
          retry={reload}
        />
      </PixelPage>
    );
  }

  const dashboard = dashboardQuery.data;
  const habits = (habitsQuery.data ?? []).filter(
    (habit) => !habit.archived && isHabitScheduledToday(habit.frequency, habit.days),
  );
  const tasks = tasksQuery.data ?? [];
  const achievements = achievementsQuery.data ?? [];
  const profile = dashboard?.profile;
  const completedToday = habits.filter((habit) =>
    habit.completedDates.some((date) => dateKey(date) === today),
  ).length;
  const progress = profile
    ? Math.round((profile.xpIntoLevel / profile.xpToNextLevel) * 100)
    : 0;
  const dateLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <PixelPage
      refreshing={dashboardQuery.isRefetching}
      onRefresh={reload}
    >
      <ScreenTitle
        eyebrow={dateLabel.toUpperCase()}
        title="PIXEL QUEST"
        subtitle="One good move at a time."
        trailing={<PixelAvatar />}
      />

      <VoiceCapture />

      <Panel>
        <View style={styles.playerTop}>
          <View>
            <Text style={[styles.levelLabel, { color: colors.cyan }]}>PLAYER LEVEL {profile?.level ?? 1}</Text>
            <Text style={[styles.playerTitle, { color: colors.foreground }]}>{profile?.title ?? 'Novice Adventurer'}</Text>
          </View>
          <View style={[styles.xpBadge, { borderColor: colors.border }]}>
            <Feather name="zap" size={14} color={colors.gold} />
            <Text style={[styles.xpNumber, { color: colors.gold }]}>{profile?.xp ?? 0} XP</Text>
          </View>
        </View>
        <PixelBar progress={progress} />
        <View style={styles.xpLabels}>
          <MetaText>{profile?.xpIntoLevel ?? 0} / {profile?.xpToNextLevel ?? 100} TO NEXT LEVEL</MetaText>
          <View style={styles.streakChip}>
            <Feather name="activity" size={13} color={colors.gold} />
            <Text style={[styles.streakText, { color: colors.gold }]}>{profile?.streak ?? 0} DAY STREAK</Text>
          </View>
        </View>
      </Panel>

      <View style={styles.statRow}>
        <StatBox label="TODAY" value={`${completedToday}/${habits.length}`} detail="habits" />
        <StatBox label="QUESTS" value={`${dashboard?.completedTasks ?? 0}`} detail="cleared" />
        <StatBox label="RATE" value={`${dashboard?.completionRate ?? 0}%`} detail="today" />
      </View>

      <View>
        <SectionHeading title="DAILY HABITS" />
        <Panel style={styles.listPanel}>
          {habits.length ? habits.map((habit) => {
            const done = habit.completedDates.some((date) => dateKey(date) === today);
            const busy = completeHabit.isPending || undoHabit.isPending;
            return (
              <View key={habit.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`${done ? 'Undo' : 'Complete'} ${habit.title}`}
                  testID={`habit-toggle-${habit.id}`}
                  disabled={busy}
                  onPress={() => {
                    const onDone = () => mutationSuccess();
                    if (done) {
                      undoHabit.mutate(
                        { habitId: habit.id, data: { date: today } },
                        { onSuccess: onDone },
                      );
                    } else {
                      completeHabit.mutate(
                        { habitId: habit.id, data: { date: today } },
                        { onSuccess: onDone },
                      );
                    }
                  }}
                  style={[
                    styles.checkbox,
                    { borderColor: done ? colors.cyan : colors.border, backgroundColor: done ? colors.cyan : 'transparent' },
                  ]}
                >
                  {done ? <Feather name="check" size={15} color={colors.background} /> : null}
                </Pressable>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: done ? colors.mutedForeground : colors.foreground }]}>{habit.title}</Text>
                  <MetaText>{habit.category.toUpperCase()}</MetaText>
                </View>
                <Text style={[styles.reward, { color: colors.gold }]}>+25</Text>
              </View>
            );
          }) : (
            <EmptyState title="NO HABITS SCHEDULED" detail="Add a daily ritual to start building your streak." />
          )}
        </Panel>
      </View>

      <View>
        <SectionHeading title="ACTIVE QUESTS" />
        <Panel style={styles.listPanel}>
          {tasks.length ? tasks.slice(0, 4).map((task) => {
            const tone = difficultyColor[task.difficulty];
            const color = colors[tone];
            return (
              <View key={task.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Complete ${task.title}`}
                  testID={`task-complete-${task.id}`}
                  disabled={completeTask.isPending}
                  onPress={() => completeTask.mutate({ taskId: task.id }, { onSuccess: mutationSuccess })}
                  style={[styles.checkbox, { borderColor: colors.border }]}
                />
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{task.title}</Text>
                  <MetaText>{task.difficulty.toUpperCase()} · {task.category.toUpperCase()}</MetaText>
                </View>
                <Text style={[styles.reward, { color }]}>+{task.difficulty === 'easy' ? 10 : task.difficulty === 'hard' ? 50 : 25}</Text>
              </View>
            );
          }) : (
            <EmptyState title="QUEST BOARD CLEAR" detail="Your next challenge can start whenever you are ready." />
          )}
          {tasks.length > 4 ? <MetaText>+{tasks.length - 4} MORE QUESTS ON YOUR BOARD</MetaText> : null}
        </Panel>
      </View>

      <View>
        <SectionHeading title="ACHIEVEMENTS" />
        <View style={styles.badges}>
          {achievements.slice(0, 4).map((achievement) => (
            <View
              key={achievement.id}
              testID={`achievement-${achievement.id}`}
              style={[
                styles.achievement,
                {
                  borderColor: achievement.unlocked ? colors.gold : colors.border,
                  backgroundColor: achievement.unlocked ? colors.muted : colors.card,
                },
              ]}
            >
              <Feather
                name={achievement.unlocked ? 'award' : 'lock'}
                size={17}
                color={achievement.unlocked ? colors.gold : colors.mutedForeground}
              />
              <Text style={[styles.achievementName, { color: achievement.unlocked ? colors.gold : colors.mutedForeground }]} numberOfLines={1}>
                {achievement.name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View>
        <SectionHeading title="QUEST LOG" />
        <Panel style={styles.listPanel}>
          {dashboard?.recentActivity.length ? dashboard.recentActivity.slice(0, 5).map((event) => (
            <View key={event.id} style={[styles.activityRow, { borderBottomColor: colors.border }]} testID={`activity-${event.id}`}>
              <Feather name={event.kind === 'habit' ? 'check-circle' : 'flag'} size={14} color={event.kind === 'habit' ? colors.cyan : colors.gold} />
              <Text style={[styles.activityLabel, { color: colors.foreground }]} numberOfLines={1}>{event.label}</Text>
              <MetaText>{new Date(event.happenedAt).toLocaleDateString()}</MetaText>
            </View>
          )) : <MetaText>No completed quests yet. Your log starts with your first win.</MetaText>}
        </Panel>
      </View>
    </PixelPage>
  );
}

function StatBox({ label, value, detail }: { label: string; value: string; detail: string }) {
  const colors = useColors();
  return (
    <Panel style={styles.statBox}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <MetaText>{detail}</MetaText>
    </Panel>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 52, height: 52, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 5, gap: 1 },
  avatarRow: { flexDirection: 'row', gap: 1 },
  avatarPixel: { width: 6, height: 6 },
  playerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  levelLabel: { fontFamily: 'PressStart2P_400Regular', fontSize: 9, lineHeight: 16 },
  playerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 5 },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1 },
  xpNumber: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, padding: 11, gap: 4 },
  statLabel: { fontFamily: 'PressStart2P_400Regular', fontSize: 8 },
  statValue: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  listPanel: { paddingVertical: 4, gap: 0 },
  listRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, paddingVertical: 10 },
  checkbox: { width: 25, height: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  reward: { fontFamily: 'PressStart2P_400Regular', fontSize: 9 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievement: { width: '48%', minHeight: 57, borderWidth: 1, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  achievementName: { fontFamily: 'DMSans_700Bold', fontSize: 11, flex: 1 },
  activityRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1 },
  activityLabel: { flex: 1, fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
});
