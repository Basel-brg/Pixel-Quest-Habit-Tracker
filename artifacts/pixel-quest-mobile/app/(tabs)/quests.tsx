import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useGetTasks,
  useUndoTaskCompletion,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { QuestTaskDifficulty } from '@workspace/api-client-react';
import { useState } from 'react';
import { StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { useColors } from '@/hooks/useColors';
import { invalidatePixelQuest } from '@/lib/pixel-quest';
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

type StatusFilter = 'active' | 'completed' | 'all';
const difficulties: QuestTaskDifficulty[] = ['easy', 'medium', 'hard'];

function xpReward(difficulty: QuestTaskDifficulty): number {
  if (difficulty === 'easy') return 10;
  if (difficulty === 'hard') return 50;
  return 25;
}

export default function QuestsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const tasksQuery = useGetTasks({ status: 'all' });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const undoTask = useUndoTaskCompletion();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestTaskDifficulty>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<QuestTaskDifficulty>('medium');
  const [priority, setPriority] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const allTasks = tasksQuery.data ?? [];
  const visibleTasks = allTasks.filter((task) => {
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesDifficulty = difficultyFilter === 'all' || task.difficulty === difficultyFilter;
    return matchesStatus && matchesDifficulty;
  });

  const clearForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setCategory('');
    setDifficulty('medium');
    setPriority(false);
    setDueDate('');
  };
  const didSave = () => {
    invalidatePixelQuest(queryClient);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearForm();
  };

  if (tasksQuery.isLoading) {
    return <PixelPage keyboard><LoadingState label="Loading your quest board..." /></PixelPage>;
  }
  if (tasksQuery.error) {
    return (
      <PixelPage keyboard>
        <ScreenTitle eyebrow="QUEST BOARD" title="QUESTS" subtitle="Choose your next challenge." />
        <ErrorState
          message={tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Could not load your quests.'}
          retry={() => void tasksQuery.refetch()}
        />
      </PixelPage>
    );
  }

  const beginEdit = (task: (typeof allTasks)[number]) => {
    setEditingId(task.id);
    setTitle(task.title);
    setCategory(task.category);
    setDifficulty(task.difficulty);
    setPriority(task.priority);
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    setShowForm(true);
    setConfirmDeleteId(null);
  };

  const saveTask = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const taskData = {
      title: cleanTitle,
      difficulty,
      category: category.trim() || 'Side Quest',
      priority,
      dueDate: dueDate.trim() || null,
    };
    if (editingId) {
      updateTask.mutate({ taskId: editingId, data: taskData }, { onSuccess: didSave });
    } else {
      createTask.mutate({ data: taskData }, { onSuccess: didSave });
    }
  };

  const validDueDate = !dueDate.trim() || /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim());

  return (
    <PixelPage keyboard>
      <ScreenTitle
        eyebrow="QUEST BOARD"
        title="QUESTS"
        subtitle="Turn the next thing into a win."
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showForm ? 'Close quest form' : 'Add a quest'}
            testID="button-toggle-quest-form"
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

      {showForm ? (
        <Panel>
          <SectionHeading title={editingId ? 'EDIT QUEST' : 'NEW QUEST'} />
          <Field
            label="QUEST NAME"
            value={title}
            onChangeText={setTitle}
            placeholder="What needs doing?"
            maxLength={110}
            returnKeyType="next"
            testID="input-quest-title"
          />
          <Field
            label="CATEGORY"
            value={category}
            onChangeText={setCategory}
            placeholder="Work, health, study..."
            maxLength={28}
            returnKeyType="next"
            testID="input-quest-category"
          />
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DIFFICULTY · XP REWARD</Text>
            <View style={styles.chipRow}>
              {difficulties.map((option) => (
                <ChoiceChip
                  key={option}
                  label={`${option.toUpperCase()} +${xpReward(option)}`}
                  selected={difficulty === option}
                  onPress={() => setDifficulty(option)}
                  testID={`difficulty-${option}`}
                />
              ))}
            </View>
          </View>
          <Field
            label="DUE DATE (OPTIONAL)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            keyboardType="numbers-and-punctuation"
            testID="input-quest-due-date"
          />
          {!validDueDate ? (
            <Text style={[styles.validation, { color: colors.destructive }]}>Enter the date as YYYY-MM-DD.</Text>
          ) : null}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: priority }}
            accessibilityLabel="Mark quest as priority"
            testID="switch-quest-priority"
            onPress={() => setPriority((value) => !value)}
            style={styles.priorityToggle}
          >
            <Feather name={priority ? 'star' : 'star'} size={17} color={priority ? colors.gold : colors.mutedForeground} />
            <Text style={[styles.priorityText, { color: priority ? colors.gold : colors.mutedForeground }]}>
              {priority ? 'PRIORITY QUEST' : 'MARK AS PRIORITY'}
            </Text>
            <View style={[styles.switchTrack, { backgroundColor: priority ? colors.cyan : colors.secondary }]}>
              <View style={[styles.switchKnob, { backgroundColor: colors.foreground, alignSelf: priority ? 'flex-end' : 'flex-start' }]} />
            </View>
          </Pressable>
          <View style={styles.formActions}>
            <PixelButton
              label={createTask.isPending || updateTask.isPending ? 'SAVING...' : editingId ? 'SAVE CHANGES' : 'ADD QUEST'}
              onPress={saveTask}
              disabled={!title.trim() || !validDueDate || createTask.isPending || updateTask.isPending}
              testID="button-save-quest"
            />
            <PixelButton label="CANCEL" tone="quiet" onPress={clearForm} testID="button-cancel-quest" />
          </View>
        </Panel>
      ) : null}

      <View>
        <SectionHeading title="STATUS" />
        <View style={styles.filterRow}>
          {(['active', 'completed', 'all'] as StatusFilter[]).map((status) => (
            <ChoiceChip
              key={status}
              label={status.toUpperCase()}
              selected={statusFilter === status}
              onPress={() => setStatusFilter(status)}
              testID={`filter-quest-${status}`}
            />
          ))}
        </View>
      </View>

      <View>
        <SectionHeading title="DIFFICULTY" />
        <View style={styles.filterRow}>
          {(['all', ...difficulties] as Array<'all' | QuestTaskDifficulty>).map((level) => (
            <ChoiceChip
              key={level}
              label={level.toUpperCase()}
              selected={difficultyFilter === level}
              onPress={() => setDifficultyFilter(level)}
              testID={`filter-difficulty-${level}`}
            />
          ))}
        </View>
      </View>

      <View>
        <SectionHeading title="THE BOARD" />
        {visibleTasks.length ? visibleTasks.map((task) => (
          <Panel key={task.id} style={styles.taskCard}>
            <View style={styles.taskTop}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.status === 'completed' }}
                accessibilityLabel={`${task.status === 'completed' ? 'Reopen' : 'Complete'} ${task.title}`}
                testID={`quest-toggle-${task.id}`}
                disabled={completeTask.isPending || undoTask.isPending}
                onPress={() => {
                  const onSuccess = () => {
                    invalidatePixelQuest(queryClient);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  };
                  if (task.status === 'completed') {
                    undoTask.mutate({ taskId: task.id }, { onSuccess });
                  } else {
                    completeTask.mutate({ taskId: task.id }, { onSuccess });
                  }
                }}
                style={[
                  styles.checkbox,
                  { borderColor: task.status === 'completed' ? colors.success : colors.border, backgroundColor: task.status === 'completed' ? colors.success : 'transparent' },
                ]}
              >
                {task.status === 'completed' ? <Feather name="check" size={15} color={colors.background} /> : null}
              </Pressable>
              <View style={styles.taskCopy}>
                <Text style={[styles.taskTitle, { color: task.status === 'completed' ? colors.mutedForeground : colors.foreground }]}>{task.title}</Text>
                <MetaText>{task.category.toUpperCase()}</MetaText>
              </View>
              {task.priority ? <Feather name="star" size={15} color={colors.gold} /> : null}
            </View>
            <View style={styles.taskMeta}>
              <View
                style={[
                  styles.difficultyBadge,
                  {
                    borderColor: task.difficulty === 'hard' ? colors.purple : task.difficulty === 'easy' ? colors.success : colors.cyan,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.difficultyText,
                    { color: task.difficulty === 'hard' ? colors.purple : task.difficulty === 'easy' ? colors.success : colors.cyan },
                  ]}
                >
                  {task.difficulty.toUpperCase()} · +{xpReward(task.difficulty)} XP
                </Text>
              </View>
              <MetaText>{task.dueDate ? `DUE ${new Date(task.dueDate).toLocaleDateString()}` : 'NO DUE DATE'}</MetaText>
            </View>
            {confirmDeleteId === task.id ? (
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmText, { color: colors.destructive }]}>Delete this quest?</Text>
                <PixelButton
                  label={deleteTask.isPending ? 'DELETING...' : 'DELETE'}
                  tone="danger"
                  compact
                  disabled={deleteTask.isPending}
                  onPress={() =>
                    deleteTask.mutate(
                      { taskId: task.id },
                      {
                        onSuccess: () => {
                          setConfirmDeleteId(null);
                          invalidatePixelQuest(queryClient);
                        },
                      },
                    )
                  }
                  testID={`quest-delete-confirm-${task.id}`}
                />
                <PixelButton label="KEEP" tone="quiet" compact onPress={() => setConfirmDeleteId(null)} testID={`quest-delete-cancel-${task.id}`} />
              </View>
            ) : (
              <View style={styles.taskActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${task.title}`}
                  testID={`quest-edit-${task.id}`}
                  onPress={() => beginEdit(task)}
                  style={styles.textAction}
                >
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>EDIT</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${task.title}`}
                  testID={`quest-delete-${task.id}`}
                  onPress={() => setConfirmDeleteId(task.id)}
                  style={styles.textAction}
                >
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={[styles.actionLabel, { color: colors.destructive }]}>DELETE</Text>
                </Pressable>
              </View>
            )}
          </Panel>
        )) : (
          <EmptyState
            title="NO QUESTS FOUND"
            detail={statusFilter === 'active' ? 'Add a quest to your board when you are ready.' : 'Try another filter or add a new quest.'}
          />
        )}
      </View>
    </PixelPage>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  priorityToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityText: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  switchTrack: { width: 40, height: 23, padding: 3, justifyContent: 'center' },
  switchKnob: { width: 17, height: 17 },
  formActions: { flexDirection: 'row', gap: 8 },
  validation: { fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
  taskCard: { marginBottom: 11 },
  taskTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 25, height: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1, gap: 4 },
  taskTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 21 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 35 },
  difficultyBadge: { borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  difficultyText: { fontFamily: 'PressStart2P_400Regular', fontSize: 7 },
  taskActions: { flexDirection: 'row', gap: 18, paddingLeft: 35, marginTop: 2 },
  textAction: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 35, marginTop: 2 },
  confirmText: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 12 },
});
