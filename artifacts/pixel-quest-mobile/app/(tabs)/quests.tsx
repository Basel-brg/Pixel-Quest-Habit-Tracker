import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompleteTask,
  useDeleteTask,
  useGetTasks,
  useQuestAssistant,
  useUndoTaskCompletion,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { QuestAssistantResult, QuestTaskDifficulty } from '@workspace/api-client-react';
import { useState } from 'react';
import { StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { useColors } from '@/hooks/useColors';
import { invalidatePixelQuest, localDateKey } from '@/lib/pixel-quest';
import { useOfflineDrafts, type ManualDraft } from '@/lib/offline-drafts';
import { PhotoProofModal, type PhotoProofTarget } from '@/components/PhotoProofModal';
import { EntryFormModal } from '@/components/EntryFormModal';
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
type QuestStat = 'STR' | 'INT' | 'WIS' | null;
const questPresets: { id: string; label: string; title: string; category: string; difficulty: QuestTaskDifficulty; stat: Exclude<QuestStat, null> }[] = [
  { id: 'workout', label: '🏋️‍♂️ تمرين 30د', title: 'تمرين 30 دقيقة', category: 'Fitness', difficulty: 'easy', stat: 'STR' },
  { id: 'study', label: '📚 دراسة ساعة', title: 'دراسة ساعة', category: 'Study', difficulty: 'medium', stat: 'INT' },
  { id: 'water', label: '💧 شرب لتر ماء', title: 'شرب لتر ماء', category: 'Health', difficulty: 'easy', stat: 'STR' },
  { id: 'room', label: '🧹 ترتيب الغرفة', title: 'ترتيب الغرفة', category: 'Home', difficulty: 'easy', stat: 'WIS' },
  { id: 'coding', label: '💻 برمجة 45د', title: 'برمجة 45 دقيقة', category: 'Coding', difficulty: 'medium', stat: 'INT' },
];

function xpReward(difficulty: QuestTaskDifficulty): number {
  if (difficulty === 'easy') return 10;
  if (difficulty === 'hard') return 50;
  return 25;
}

export default function QuestsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const offline = useOfflineDrafts();
  const tasksQuery = useGetTasks({ status: 'all' });
  const updateTask = useUpdateTask();
  const assistant = useQuestAssistant();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const undoTask = useUndoTaskCompletion();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestTaskDifficulty>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [offlineDraftId, setOfflineDraftId] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<QuestTaskDifficulty>('medium');
  const [stat, setStat] = useState<QuestStat>(null);
  const [priority, setPriority] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [requiresPhotoProof, setRequiresPhotoProof] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiError, setAiError] = useState('');
  const [photoTarget, setPhotoTarget] = useState<PhotoProofTarget | null>(null);
  const allTasks = tasksQuery.data ?? [];
  const visibleTasks = allTasks.filter((task) => {
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesDifficulty = difficultyFilter === 'all' || task.difficulty === difficultyFilter;
    return matchesStatus && matchesDifficulty;
  });

  const clearForm = () => {
    setShowForm(false);
    setEditingId(null);
    setOfflineDraftId(null);
    setDraftError('');
    setTitle('');
    setCategory('');
    setDifficulty('medium');
    setStat(null);
    setPriority(false);
    setDueDate('');
    setRequiresPhotoProof(false);
    setAiPrompt('');
    setAiError('');
  };
  const didSave = () => {
    invalidatePixelQuest(queryClient);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearForm();
  };

  if (tasksQuery.isLoading && offline.online !== false) {
    return <PixelPage keyboard><LoadingState label="Loading your quest board..." /></PixelPage>;
  }

  const beginEdit = (task: (typeof allTasks)[number]) => {
    setEditingId(task.id);
    setTitle(task.title);
    setCategory(task.category);
    setDifficulty(task.difficulty);
    setStat(task.stat);
    setPriority(task.priority);
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    setRequiresPhotoProof(task.requiresPhotoProof);
    setAiPrompt('');
    setAiError('');
    setShowForm(true);
    setConfirmDeleteId(null);
  };

  const saveTask = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const taskData = {
      title: cleanTitle,
      difficulty,
      category: category.trim() || 'Side Quest',
      stat,
      priority,
      dueDate: dueDate.trim() || null,
      requiresPhotoProof,
    };
    if (editingId) {
      if (offline.online === false) {
        setDraftError('Editing an existing quest requires an internet connection.');
        return;
      }
      updateTask.mutate({ taskId: editingId, data: taskData }, { onSuccess: didSave });
    } else {
      setDraftSaving(true);
      const { stat: questStat, ...taskFields } = taskData;
      const input = { action: 'saveQuest' as const, ...taskFields, questStat, type: 'single' as const, tags: [] };
      const saved = offlineDraftId
        ? await offline.update(offlineDraftId, input)
        : await offline.add(input);
      if (saved) didSave();
      else setDraftError(offline.storageError || 'Could not save this quest draft on the device.');
      setDraftSaving(false);
    }
  };

  const editOfflineDraft = (draft: ManualDraft) => {
    const input = draft.input;
    setEditingId(null);
    setOfflineDraftId(draft.id);
    setTitle(input.title ?? '');
    setCategory(input.category ?? 'Side Quest');
    setDifficulty(input.difficulty ?? 'medium');
    setStat(input.questStat ?? null);
    setPriority(input.priority ?? false);
    setDueDate(input.dueDate ?? '');
    setRequiresPhotoProof(input.requiresPhotoProof ?? false);
    setAiPrompt('');
    setAiError('');
    setShowForm(true);
    setDraftError('');
  };

  const validDueDate = !dueDate.trim() || /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim());

  const applySuggestion = (suggestion: QuestAssistantResult) => {
    setTitle(suggestion.title);
    setCategory(suggestion.category);
    setDifficulty(suggestion.difficulty);
    setStat(suggestion.stat);
    setPriority(suggestion.priority);
    setDueDate(suggestion.dueDate ?? localDateKey());
  };

  const requestSuggestion = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    if (offline.online === false) {
      setAiError('المساعدة السحرية تحتاج إلى اتصال بالإنترنت.');
      return;
    }
    setAiError('');
    try {
      applySuggestion(await assistant.mutateAsync({ data: { itemType: 'quest', prompt } }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'تعذر تحليل الوصف. حاول مرة أخرى.');
    }
  };

  const applyPreset = (preset: (typeof questPresets)[number]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setDifficulty(preset.difficulty);
    setStat(preset.stat);
    setDueDate(localDateKey());
  };

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

      <EntryFormModal
        visible={showForm}
        title={editingId ? 'EDIT QUEST' : offlineDraftId ? 'EDIT SAVED DRAFT' : 'NEW QUEST'}
        onClose={clearForm}
        actions={
          <View style={styles.formActions}>
            <PixelButton
              label={draftSaving || updateTask.isPending ? 'جاري الحفظ...' : 'حفظ'}
              tone="gold"
              onPress={saveTask}
              disabled={!title.trim() || !validDueDate || draftSaving || updateTask.isPending}
              testID="button-save-quest"
            />
            <PixelButton label="إلغاء" tone="quiet" onPress={clearForm} testID="button-cancel-quest" />
          </View>
        }
      >
        <Panel>
          <SectionHeading title="مساعدة سحرية ✨" />
          <Field
            label="وصف المهمة أو العادة"
            value={aiPrompt}
            onChangeText={setAiPrompt}
            placeholder="🔍 اكتب مهمتك أو عادتك هنا.. مثلاً: دراسة رياضيات ساعة اليوم"
            multiline
            maxLength={500}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
            testID="input-quest-ai-prompt"
          />
          {offline.online === false ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>اقتراحات الذكاء الاصطناعي تحتاج إلى اتصال بالإنترنت؛ يمكنك حفظ المهام اليدوية كمسودات دون اتصال.</Text> : null}
          <PixelButton
            label={assistant.isPending ? 'جاري التحليل...' : 'مساعدة سحرية ✨'}
            tone="cyan"
            onPress={() => void requestSuggestion()}
            disabled={!aiPrompt.trim() || assistant.isPending || offline.online === false}
            testID="button-quest-ai-fill"
          />
          {aiError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{aiError}</Text> : null}
        </Panel>

        <Panel>
          <SectionHeading title="قوالب سريعة" />
          <View style={styles.chipRow}>
            {questPresets.map((preset) => (
              <ChoiceChip
                key={preset.id}
                label={preset.label}
                selected={false}
                onPress={() => applyPreset(preset)}
                testID={`quest-template-${preset.id}`}
              />
            ))}
          </View>
        </Panel>

        <Panel>
          <SectionHeading title={editingId ? 'EDIT QUEST' : offlineDraftId ? 'EDIT SAVED DRAFT' : 'NEW QUEST'} />
          {draftError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{draftError}</Text> : null}
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
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SKILL BONUS · OPTIONAL</Text>
            <View style={styles.chipRow}>
              <ChoiceChip label="NONE" selected={stat === null} onPress={() => setStat(null)} testID="quest-stat-none" />
              {(['STR', 'INT', 'WIS'] as const).map((value) => (
                <ChoiceChip key={value} label={value} selected={stat === value} onPress={() => setStat(value)} testID={`quest-stat-${value.toLowerCase()}`} />
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
            <Feather name="star" size={17} color={priority ? colors.gold : colors.mutedForeground} />
            <Text style={[styles.priorityText, { color: priority ? colors.gold : colors.mutedForeground }]}>
              {priority ? 'PRIORITY QUEST' : 'MARK AS PRIORITY'}
            </Text>
            <View style={[styles.switchTrack, { backgroundColor: priority ? colors.cyan : colors.secondary }]}>
              <View style={[styles.switchKnob, { backgroundColor: colors.foreground, alignSelf: priority ? 'flex-end' : 'flex-start' }]} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: requiresPhotoProof }}
            accessibilityLabel="Require Photo Proof"
            testID="switch-quest-photo-proof"
            onPress={() => setRequiresPhotoProof(value => !value)}
            style={styles.priorityToggle}
          >
            <Feather name="camera" size={17} color={requiresPhotoProof ? colors.cyan : colors.mutedForeground} />
            <View style={styles.photoProofCopy}>
              <Text style={[styles.priorityText, { color: requiresPhotoProof ? colors.cyan : colors.mutedForeground }]}>REQUIRE PHOTO PROOF (📸)</Text>
              <Text style={[styles.photoProofHint, { color: colors.mutedForeground }]}>يتطلب إثباتاً بالصورة للحصول على المكافأة</Text>
            </View>
            <View style={[styles.switchTrack, { backgroundColor: requiresPhotoProof ? colors.cyan : colors.secondary }]}>
              <View style={[styles.switchKnob, { backgroundColor: colors.foreground, alignSelf: requiresPhotoProof ? 'flex-end' : 'flex-start' }]} />
            </View>
          </Pressable>
        </Panel>
      </EntryFormModal>

      {tasksQuery.error ? <ErrorState message={tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Could not load your quests.'} retry={() => void tasksQuery.refetch()} /> : null}
      {offline.storageError ? <Text accessibilityRole="alert" testID="status-offline-storage-error" style={{ color: colors.destructive, fontSize: 12 }}>{offline.storageError}</Text> : null}
      {draftError ? <Text accessibilityRole="alert" testID="status-quest-draft-error" style={{ color: colors.destructive, fontSize: 12 }}>{draftError}</Text> : null}
      {offline.drafts.filter(draft => draft.kind === 'task').length ? (
        <View>
          <SectionHeading title="SAVED QUEST DRAFTS" />
          {offline.drafts.filter(draft => draft.kind === 'task').map(draft => (
            <View key={draft.id} testID={`card-offline-draft-${draft.id}`} style={styles.taskCard}>
              <Panel>
                <Text testID={`text-offline-draft-title-${draft.id}`} style={{ color: colors.foreground, fontWeight: '700' }}>{draft.input.title}</Text>
                <View testID={`status-offline-draft-${draft.id}`}><MetaText>{draft.status === 'failed' ? 'SYNC FAILED · RETRY WHEN ONLINE' : draft.status === 'syncing' ? 'SYNCING…' : 'WAITING FOR CONNECTION'}</MetaText></View>
                <View style={styles.formActions}>
                  {draft.status === 'failed' ? <PixelButton label="RETRY" tone="quiet" onPress={() => void offline.retry(draft.id)} testID={`button-retry-draft-${draft.id}`} /> : null}
                  <PixelButton label="EDIT" tone="quiet" onPress={() => editOfflineDraft(draft)} testID={`button-edit-draft-${draft.id}`} />
                  <PixelButton label="REMOVE" tone="quiet" onPress={() => void offline.remove(draft.id)} testID={`button-remove-draft-${draft.id}`} />
                </View>
              </Panel>
            </View>
          ))}
        </View>
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
              {task.requiresPhotoProof && task.status !== 'completed' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Verify ${task.title} with a photo`}
                  testID={`quest-photo-proof-${task.id}`}
                  disabled={completeTask.isPending}
                  onPress={() => setPhotoTarget({ itemType: 'quest', itemId: task.id, title: task.title })}
                  style={[styles.checkbox, { borderColor: colors.cyan }]}
                ><Feather name="camera" size={15} color={colors.cyan} /></Pressable>
              ) : (
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
              )}
              <View style={styles.taskCopy}>
                <Text style={[styles.taskTitle, { color: task.status === 'completed' ? colors.mutedForeground : colors.foreground }]}>{task.title}</Text>
                <MetaText>{task.category.toUpperCase()}{task.stat ? ` · ${task.stat}` : ''}</MetaText>
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
      {photoTarget ? <PhotoProofModal target={photoTarget} onClose={() => setPhotoTarget(null)} /> : null}
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
  photoProofCopy: { flex: 1, gap: 4 },
  photoProofHint: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
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
