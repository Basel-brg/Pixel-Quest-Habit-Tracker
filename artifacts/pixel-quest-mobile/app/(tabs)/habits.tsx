import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompleteHabit,
  useCreateHabit,
  useGetHabits,
  useUndoHabitCompletion,
  useUpdateHabit,
} from '@workspace/api-client-react';
import type { Habit } from '@workspace/api-client-react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  dateKey,
  invalidatePixelQuest,
  localDateKey,
} from '@/lib/pixel-quest';
import {
  ChoiceChip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  MetaText,
  Panel,
  PixelButton,
  PixelPage,
  ScreenTitle,
  SectionHeading,
} from '@/components/PixelUI';

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function HabitsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [days, setDays] = useState<number[]>([]);
  const habitsQuery = useGetHabits({ archived: showArchived });
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const completeHabit = useCompleteHabit();
  const undoHabit = useUndoHabitCompletion();
  const today = localDateKey();
  const habits = habitsQuery.data ?? [];

  const clearForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setCategory('');
    setFrequency('daily');
    setDays([]);
  };
  const updated = () => {
    invalidatePixelQuest(queryClient);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearForm();
  };

  if (habitsQuery.isLoading) {
    return <PixelPage keyboard><LoadingState label="Loading your habits..." /></PixelPage>;
  }
  if (habitsQuery.error) {
    return (
      <PixelPage keyboard>
        <ScreenTitle eyebrow="PLAYER JOURNAL" title="HABITS" subtitle="Build your daily rituals." />
        <ErrorState
          message={habitsQuery.error instanceof Error ? habitsQuery.error.message : 'Could not load your habits.'}
          retry={() => void habitsQuery.refetch()}
        />
      </PixelPage>
    );
  }

  const beginEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setTitle(habit.title);
    setCategory(habit.category);
    setFrequency(habit.frequency);
    setDays(habit.days);
    setShowForm(true);
  };

  const saveHabit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const habitData = {
      title: cleanTitle,
      category: category.trim() || 'Personal',
      frequency,
      days: frequency === 'daily' ? [] : days,
    };
    if (editingId) {
      updateHabit.mutate(
        { habitId: editingId, data: habitData },
        { onSuccess: updated },
      );
    } else {
      createHabit.mutate({ data: habitData }, { onSuccess: updated });
    }
  };

  const toggleDay = (day: number) => {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  return (
    <PixelPage keyboard>
      <ScreenTitle
        eyebrow="PLAYER JOURNAL"
        title="HABITS"
        subtitle="Small rituals, lasting stats."
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showForm ? 'Close habit form' : 'Add a habit'}
            testID="button-toggle-habit-form"
            onPress={() => {
              if (showForm) clearForm();
              else {
                setShowForm(true);
                setEditingId(null);
              }
            }}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primaryForeground} />
          </Pressable>
        }
      />

      <View style={styles.filterRow}>
        <ChoiceChip label="ACTIVE" selected={!showArchived} onPress={() => { setShowArchived(false); clearForm(); }} testID="filter-habits-active" />
        <ChoiceChip label="ARCHIVED" selected={showArchived} onPress={() => { setShowArchived(true); clearForm(); }} testID="filter-habits-archived" />
      </View>

      {showForm ? (
        <Panel>
          <SectionHeading title={editingId ? 'EDIT HABIT' : 'NEW HABIT'} />
          <Field
            label="HABIT NAME"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Morning walk"
            returnKeyType="next"
            maxLength={90}
            testID="input-habit-title"
          />
          <Field
            label="CATEGORY"
            value={category}
            onChangeText={setCategory}
            placeholder="Health, study, focus..."
            returnKeyType="done"
            maxLength={28}
            testID="input-habit-category"
          />
          <View style={styles.chipRow}>
            <ChoiceChip label="DAILY" selected={frequency === 'daily'} onPress={() => setFrequency('daily')} testID="frequency-daily" />
            <ChoiceChip label="WEEKLY SCHEDULE" selected={frequency === 'weekly'} onPress={() => setFrequency('weekly')} testID="frequency-weekly" />
          </View>
          {frequency === 'weekly' ? (
            <View style={styles.dayPicker}>
              {weekdays.map((day, index) => {
                const selected = days.includes(index);
                return (
                  <Pressable
                    key={`weekday-${index}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Schedule on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}`}
                    accessibilityState={{ checked: selected }}
                    testID={`habit-day-${index}`}
                    onPress={() => toggleDay(index)}
                    style={[
                      styles.dayButton,
                      {
                        backgroundColor: selected ? colors.cyan : colors.sidebar,
                        borderColor: selected ? colors.cyan : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.dayText, { color: selected ? colors.background : colors.mutedForeground }]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.formActions}>
            <PixelButton
              label={createHabit.isPending || updateHabit.isPending ? 'SAVING...' : editingId ? 'SAVE CHANGES' : 'ADD HABIT'}
              onPress={saveHabit}
              disabled={!title.trim() || createHabit.isPending || updateHabit.isPending || (frequency === 'weekly' && days.length === 0)}
              testID="button-save-habit"
            />
            <PixelButton label="CANCEL" tone="quiet" onPress={clearForm} testID="button-cancel-habit" />
          </View>
        </Panel>
      ) : null}

      <View>
        <SectionHeading title={showArchived ? 'ARCHIVED RITUALS' : 'YOUR RITUALS'} />
        {habits.length ? habits.map((habit) => {
          const isDone = habit.completedDates.some((value) => dateKey(value) === today);
          const history = new Set(habit.completedDates.map(dateKey));
          const last30Days = Array.from({ length: 30 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - index));
            return localDateKey(date);
          });
          return (
            <Panel key={habit.id} style={styles.habitCard}>
              <View style={styles.habitHeading}>
                <View style={styles.habitCopy}>
                  <Text style={[styles.habitTitle, { color: colors.foreground }]}>{habit.title}</Text>
                  <MetaText>{habit.category.toUpperCase()} · {habit.frequency === 'daily' ? 'EVERY DAY' : `${habit.days.length} DAYS / WEEK`}</MetaText>
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone }}
                  accessibilityLabel={`${isDone ? 'Undo' : 'Complete'} ${habit.title}`}
                  testID={`habit-complete-${habit.id}`}
                  disabled={completeHabit.isPending || undoHabit.isPending || showArchived}
                  onPress={() => {
                    const onSuccess = () => {
                      invalidatePixelQuest(queryClient);
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    };
                    if (isDone) {
                      undoHabit.mutate({ habitId: habit.id, data: { date: today } }, { onSuccess });
                    } else {
                      completeHabit.mutate({ habitId: habit.id, data: { date: today } }, { onSuccess });
                    }
                  }}
                  style={[
                    styles.completeButton,
                    { backgroundColor: isDone ? colors.cyan : 'transparent', borderColor: isDone ? colors.cyan : colors.border },
                  ]}
                >
                  <Feather name={isDone ? 'check' : 'plus'} size={17} color={isDone ? colors.background : colors.cyan} />
                </Pressable>
              </View>

              <View style={styles.heatmapHead}>
                <Text style={[styles.heatmapLabel, { color: colors.mutedForeground }]}>30-DAY PIXEL LOG</Text>
                <MetaText>{habit.completedDates.length} TOTAL</MetaText>
              </View>
              <View style={styles.heatmap}>
                {last30Days.map((date) => (
                  <View
                    key={`${habit.id}-${date}`}
                    accessibilityLabel={`${date}${history.has(date) ? ', completed' : ', not completed'}`}
                    testID={`habit-heat-${habit.id}-${date}`}
                    style={[
                      styles.heatSquare,
                      {
                        backgroundColor: history.has(date) ? colors.cyan : colors.sidebar,
                        borderColor: history.has(date) ? colors.cyan : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>

              <View style={styles.habitActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${habit.title}`}
                  testID={`habit-edit-${habit.id}`}
                  onPress={() => beginEdit(habit)}
                  style={styles.iconAction}
                >
                  <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>EDIT</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${showArchived ? 'Restore' : 'Archive'} ${habit.title}`}
                  testID={`habit-archive-${habit.id}`}
                  onPress={() =>
                    updateHabit.mutate(
                      { habitId: habit.id, data: { archived: !showArchived } },
                      { onSuccess: () => invalidatePixelQuest(queryClient) },
                    )
                  }
                  style={styles.iconAction}
                >
                  <Feather name={showArchived ? 'rotate-ccw' : 'archive'} size={15} color={colors.mutedForeground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{showArchived ? 'RESTORE' : 'ARCHIVE'}</Text>
                </Pressable>
              </View>
            </Panel>
          );
        }) : (
          <EmptyState
            title={showArchived ? 'NO ARCHIVED HABITS' : 'YOUR JOURNAL IS OPEN'}
            detail={showArchived ? 'Archived habits will appear here.' : 'Add your first habit and start building a streak.'}
          />
        )}
      </View>
    </PixelPage>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayPicker: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  dayButton: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  habitCard: { marginBottom: 12 },
  habitHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  habitCopy: { flex: 1, gap: 5 },
  habitTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  completeButton: { width: 34, height: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  heatmapHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  heatmapLabel: { fontFamily: 'PressStart2P_400Regular', fontSize: 8 },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  heatSquare: { width: 20, height: 20, borderWidth: 1 },
  habitActions: { flexDirection: 'row', gap: 20, paddingTop: 3 },
  iconAction: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
});
