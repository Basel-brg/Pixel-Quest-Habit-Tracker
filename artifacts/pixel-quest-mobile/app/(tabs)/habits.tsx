import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompleteHabit,
  useGetHabits,
  useQuestAssistant,
  useUndoHabitCompletion,
  useUpdateHabit,
} from '@workspace/api-client-react';
import type { Habit, QuestAssistantResult, RpgActionInputStat } from '@workspace/api-client-react';
import { useState } from 'react';
import { StyleSheet} from 'react-native';
import { Pressable, Text, View } from "@/components/Themed";
import { useColors } from '@/hooks/useColors';
import { EntryFormModal } from '@/components/EntryFormModal';
import { HabitReminderControls } from '@/components/HabitReminderControls';
import { useHabitReminders } from '@/lib/habit-reminders';
import { useOfflineDrafts, type ManualDraft } from '@/lib/offline-drafts';
import { PhotoProofModal, type PhotoProofTarget } from '@/components/PhotoProofModal';
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
const habitPresets: { id: string; label: string; title: string; category: string; stat: RpgActionInputStat; target: number; unit: string }[] = [
  { id: 'water', label: '💧 شرب 2.5 لتر ماء', title: 'شرب 2.5 لتر ماء', category: 'Health', stat: 'STR', target: 2.5, unit: 'لتر' },
  { id: 'reading', label: '📖 قراءة 15 صفحة', title: 'قراءة 15 صفحة', category: 'Learning', stat: 'INT', target: 15, unit: 'صفحة' },
  { id: 'meditation', label: '🧘 تأمل 10 دقائق', title: 'تأمل 10 دقائق', category: 'Mindfulness', stat: 'WIS', target: 10, unit: 'دقيقة' },
  { id: 'walking', label: '🏃‍♂️ مشي 6000 خطوة', title: 'مشي 6000 خطوة', category: 'Fitness', stat: 'STR', target: 6000, unit: 'خطوة' },
];

export default function HabitsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const reminders = useHabitReminders();
  const offline = useOfflineDrafts();
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [offlineDraftId, setOfflineDraftId] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [stat, setStat] = useState<RpgActionInputStat>('STR');
  const [target, setTarget] = useState('1');
  const [unit, setUnit] = useState('time');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [requiresPhotoProof, setRequiresPhotoProof] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiError, setAiError] = useState('');
  const [photoTarget, setPhotoTarget] = useState<PhotoProofTarget | null>(null);
  const habitsQuery = useGetHabits({ archived: showArchived });
  const updateHabit = useUpdateHabit();
  const assistant = useQuestAssistant();
  const completeHabit = useCompleteHabit();
  const undoHabit = useUndoHabitCompletion();
  const today = localDateKey();
  const habits = habitsQuery.data ?? [];

  const clearForm = () => {
    setShowForm(false);
    setEditingId(null);
    setOfflineDraftId(null);
    setDraftError('');
    setTitle('');
    setCategory('');
    setStat('STR');
    setTarget('1');
    setUnit('time');
    setFrequency('daily');
    setDays([]);
    setRequiresPhotoProof(false);
    setAiPrompt('');
    setAiError('');
  };
  const updated = () => {
    invalidatePixelQuest(queryClient);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearForm();
  };

  if (habitsQuery.isLoading && offline.online !== false) {
    return <PixelPage keyboard><LoadingState label="Loading your habits..." /></PixelPage>;
  }

  const beginEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setTitle(habit.title);
    setCategory(habit.category);
    setStat(habit.stat);
    setTarget(String(habit.target));
    setUnit(habit.unit);
    setFrequency(habit.frequency);
    setDays(habit.days);
    setRequiresPhotoProof(habit.requiresPhotoProof);
    setAiPrompt('');
    setAiError('');
    setShowForm(true);
  };

  const saveHabit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const numericTarget = Number(target);
    if (!Number.isFinite(numericTarget) || numericTarget < 1 || numericTarget > 1_000_000) {
      setDraftError('Enter a target between 1 and 1,000,000.');
      return;
    }
    const habitData = {
      title: cleanTitle,
      category: category.trim() || 'Personal',
      stat,
      target: numericTarget,
      unit: unit.trim() || 'completion',
      frequency,
      days: frequency === 'daily' ? [] : days,
      requiresPhotoProof,
    };
    if (editingId) {
      if (offline.online === false) {
        setDraftError('Editing an existing habit requires an internet connection.');
        return;
      }
      updateHabit.mutate(
        { habitId: editingId, data: habitData },
        { onSuccess: async habit => {
          try { await reminders.syncHabit(habit); } finally { updated(); }
        } },
      );
    } else {
      setDraftSaving(true);
      const input = { action: 'saveHabit' as const, ...habitData, days: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : habitData.days };
      const saved = offlineDraftId
        ? await offline.update(offlineDraftId, input)
        : await offline.add(input);
      if (saved) updated();
      else setDraftError(offline.storageError || 'Could not save this habit draft on the device.');
      setDraftSaving(false);
    }
  };

  const editOfflineDraft = (draft: ManualDraft) => {
    const input = draft.input;
    setEditingId(null);
    setOfflineDraftId(draft.id);
    setTitle(input.title ?? '');
    setCategory(input.category ?? 'Personal');
    setStat(input.stat ?? 'STR');
    setTarget(String(input.target ?? 1));
    setUnit(input.unit ?? 'completion');
    setFrequency(input.frequency ?? 'daily');
    setDays(input.days ?? []);
    setRequiresPhotoProof(input.requiresPhotoProof ?? false);
    setAiPrompt('');
    setAiError('');
    setShowForm(true);
    setDraftError('');
  };

  const applySuggestion = (suggestion: QuestAssistantResult) => {
    setTitle(suggestion.title);
    setCategory(suggestion.category);
    setStat(suggestion.stat ?? 'STR');
    setTarget(String(suggestion.target));
    setUnit(suggestion.unit);
    setFrequency(suggestion.frequency);
    setDays(suggestion.frequency === 'daily' ? [] : suggestion.days);
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
      applySuggestion(await assistant.mutateAsync({ data: { itemType: 'habit', prompt } }));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'تعذر تحليل الوصف. حاول مرة أخرى.');
    }
  };

  const applyPreset = (preset: (typeof habitPresets)[number]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setStat(preset.stat);
    setTarget(String(preset.target));
    setUnit(preset.unit);
    setFrequency('daily');
    setDays([]);
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
      {habitsQuery.error ? <ErrorState message={habitsQuery.error instanceof Error ? habitsQuery.error.message : 'Could not load your habits.'} retry={() => void habitsQuery.refetch()} /> : null}
      {reminders.error ? <ErrorState message={reminders.error} retry={reminders.retry} /> : null}
      {offline.storageError ? <Text accessibilityRole="alert" testID="status-offline-storage-error" style={{ color: colors.destructive, fontSize: 12 }}>{offline.storageError}</Text> : null}
      {draftError ? <Text accessibilityRole="alert" testID="status-habit-draft-error" style={{ color: colors.destructive, fontSize: 12 }}>{draftError}</Text> : null}

      <EntryFormModal
        visible={showForm}
        title={editingId ? 'EDIT HABIT' : offlineDraftId ? 'EDIT SAVED DRAFT' : 'NEW HABIT'}
        onClose={clearForm}
        actions={
          <View style={styles.formActions}>
            <PixelButton
              label={draftSaving || updateHabit.isPending ? 'جاري الحفظ...' : 'حفظ'}
              tone="gold"
              onPress={saveHabit}
              disabled={!title.trim() || draftSaving || updateHabit.isPending || (frequency === 'weekly' && days.length === 0)}
              testID="button-save-habit"
            />
            <PixelButton label="إلغاء" tone="quiet" onPress={clearForm} testID="button-cancel-habit" />
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
            testID="input-habit-ai-prompt"
          />
          {offline.online === false ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>اقتراحات الذكاء الاصطناعي تحتاج إلى اتصال بالإنترنت؛ يمكنك حفظ العادات اليدوية كمسودات دون اتصال.</Text> : null}
          <PixelButton
            label={assistant.isPending ? 'جاري التحليل...' : 'مساعدة سحرية ✨'}
            tone="cyan"
            onPress={() => void requestSuggestion()}
            disabled={!aiPrompt.trim() || assistant.isPending || offline.online === false}
            testID="button-habit-ai-fill"
          />
          {aiError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{aiError}</Text> : null}
        </Panel>

        <Panel>
          <SectionHeading title="قوالب سريعة" />
          <View style={styles.chipRow}>
            {habitPresets.map((preset) => (
              <ChoiceChip
                key={preset.id}
                label={preset.label}
                selected={false}
                onPress={() => applyPreset(preset)}
                testID={`habit-template-${preset.id}`}
              />
            ))}
          </View>
        </Panel>

        <Panel>
          <SectionHeading title={editingId ? 'EDIT HABIT' : offlineDraftId ? 'EDIT SAVED DRAFT' : 'NEW HABIT'} />
          {draftError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{draftError}</Text> : null}
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
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STAT</Text>
            <View style={styles.chipRow}>
              {(['STR', 'INT', 'WIS'] as const).map((value) => (
                <ChoiceChip key={value} label={value} selected={stat === value} onPress={() => setStat(value)} testID={`habit-stat-${value.toLowerCase()}`} />
              ))}
            </View>
          </View>
          <View style={styles.targetRow}>
            <View style={styles.targetField}>
              <Field
                label="DAILY TARGET"
                value={target}
                onChangeText={setTarget}
                placeholder="1"
                keyboardType="decimal-pad"
                testID="input-habit-target"
              />
            </View>
            <View style={styles.targetField}>
              <Field
                label="UNIT"
                value={unit}
                onChangeText={setUnit}
                placeholder="pages, minutes..."
                maxLength={30}
                testID="input-habit-unit"
              />
            </View>
          </View>
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
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: requiresPhotoProof }}
            accessibilityLabel="Require Photo Proof"
            testID="switch-habit-photo-proof"
            onPress={() => setRequiresPhotoProof(value => !value)}
            style={styles.photoProofToggle}
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

      {offline.drafts.filter(draft => draft.kind === 'habit').length ? (
        <View>
          <SectionHeading title="SAVED HABIT DRAFTS" />
          {offline.drafts.filter(draft => draft.kind === 'habit').map(draft => (
            <View key={draft.id} testID={`card-offline-draft-${draft.id}`} style={{ marginBottom: 10 }}>
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
                {habit.requiresPhotoProof && !isDone ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Verify ${habit.title} with a photo`}
                    testID={`habit-photo-proof-${habit.id}`}
                    disabled={completeHabit.isPending || showArchived}
                    onPress={() => setPhotoTarget({ itemType: 'habit', itemId: habit.id, title: habit.title })}
                    style={[styles.completeButton, { backgroundColor: 'transparent', borderColor: colors.cyan }]}
                  ><Feather name="camera" size={17} color={colors.cyan} /></Pressable>
                ) : (
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
                )}
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
                      { onSuccess: async changed => {
                        try { await reminders.syncHabit(changed); } finally { invalidatePixelQuest(queryClient); }
                      } },
                    )
                  }
                  style={styles.iconAction}
                >
                  <Feather name={showArchived ? 'rotate-ccw' : 'archive'} size={15} color={colors.mutedForeground} />
                  <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{showArchived ? 'RESTORE' : 'ARCHIVE'}</Text>
                </Pressable>
              </View>
              <HabitReminderControls habit={habit} />
            </Panel>
          );
        }) : (
          <EmptyState
            title={showArchived ? 'NO ARCHIVED HABITS' : 'YOUR JOURNAL IS OPEN'}
            detail={showArchived ? 'Archived habits will appear here.' : 'Add your first habit and start building a streak.'}
          />
        )}
      </View>
      {photoTarget ? <PhotoProofModal target={photoTarget} onClose={() => setPhotoTarget(null)} /> : null}
    </PixelPage>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8 },
  fieldGroup: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  targetRow: { flexDirection: 'row', gap: 12 },
  targetField: { flex: 1 },
  dayPicker: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  dayButton: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  photoProofToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoProofCopy: { flex: 1, gap: 4 },
  priorityText: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  photoProofHint: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
  switchTrack: { width: 40, height: 23, padding: 3, justifyContent: 'center' },
  switchKnob: { width: 17, height: 17 },
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
