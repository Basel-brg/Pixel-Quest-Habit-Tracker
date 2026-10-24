import { useAuth } from '@clerk/expo';
import {
  getGetRpgStateQueryKey,
  useGetRpgState,
  useParseVoice,
  usePerformRpgAction,
  type VoiceAudioInputMimeType,
  type VoiceHabit,
  type VoiceTask,
} from '@workspace/api-client-react';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Pressable, Text } from '@/components/Themed';
import { ChoiceChip, Field, MetaText, Panel, PixelButton, SectionHeading } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';
import { invalidatePixelQuest, localDateKey } from '@/lib/pixel-quest';

type ReviewEntry = {
  id: string;
  kind: 'task' | 'habit';
  title: string;
  category: string;
  confidence: number;
  difficulty: 'easy' | 'medium' | 'hard';
  priority: boolean;
  dueDate: string;
  frequency: 'daily' | 'weekly';
  days: number[];
  selected: boolean;
};

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const allDays = [0, 1, 2, 3, 4, 5, 6];

function taskEntry(task: VoiceTask, today: string): ReviewEntry {
  return {
    id: Crypto.randomUUID(),
    kind: 'task',
    title: task.title,
    category: task.category ?? 'General',
    confidence: task.confidence,
    difficulty: task.difficulty ?? 'medium',
    priority: task.priority ?? false,
    dueDate: task.dueDate ?? today,
    frequency: 'daily',
    days: allDays,
    selected: true,
  };
}

function habitEntry(habit: VoiceHabit): ReviewEntry {
  return {
    id: Crypto.randomUUID(),
    kind: 'habit',
    title: habit.title,
    category: habit.category ?? 'Personal',
    confidence: habit.confidence,
    difficulty: 'medium',
    priority: false,
    dueDate: '',
    frequency: habit.frequency ?? 'daily',
    days: habit.days ?? [],
    selected: true,
  };
}

function errorText(error: unknown): string {
  const value = error as { data?: { error?: string }; message?: string };
  return value?.data?.error ?? value?.message ?? 'Voice processing failed. Please try again.';
}

export function VoiceCapture() {
  const colors = useColors();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const actorRef = useRef(userId);
  actorRef.current = userId;
  const recordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseVoice = useParseVoice();
  const createAction = usePerformRpgAction();
  const stateQuery = useGetRpgState();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [settingsNeeded, setSettingsNeeded] = useState(false);
  const [message, setMessage] = useState('');
  const [transcript, setTranscript] = useState('');
  const [review, setReview] = useState<ReviewEntry[]>([]);
  const [savingItems, setSavingItems] = useState(false);

  const refreshNetwork = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(connected);
      return connected;
    } catch {
      setOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void refreshNetwork();
    const subscription = Network.addNetworkStateListener(state => {
      setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => {
      subscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recordingRef.current) {
        recordingRef.current = false;
        void recorderRef.current.stop().then(() => {
          const uri = recorderRef.current.uri;
          if (uri) new File(uri).delete();
        }).catch(() => undefined);
      }
    };
  }, [refreshNetwork]);

  const addEntry = async (entry: ReviewEntry) => {
    const actor = actorRef.current;
    if (!actor) return false;
    const data = entry.kind === 'task'
      ? {
          action: 'saveQuest' as const,
          title: entry.title.trim(),
          category: entry.category.trim() || 'General',
          difficulty: entry.difficulty,
          priority: entry.priority,
          dueDate: entry.dueDate || stateQuery.data?.today || localDateKey(),
          type: 'single' as const,
          tags: [],
        }
      : {
          action: 'saveHabit' as const,
          title: entry.title.trim(),
          category: entry.category.trim() || 'Personal',
          frequency: entry.frequency,
          days: entry.frequency === 'daily' ? allDays : entry.days,
        };
    try {
      await createAction.mutateAsync({ data: { ...data, requestId: entry.id } });
      if (actorRef.current !== actor) return false;
      invalidatePixelQuest(queryClient);
      void queryClient.invalidateQueries({ queryKey: getGetRpgStateQueryKey() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch {
      return false;
    }
  };

  const processAudioFile = async (uri: string) => {
    let file: File | null = null;
    try {
      if (!await refreshNetwork()) {
        setMessage('Voice entry needs an internet connection. This recording was discarded.');
        return;
      }
      file = new File(uri);
      const audioBase64 = await file.base64();
      const mimeType: VoiceAudioInputMimeType = 'audio/m4a';
      setProcessing(true);
      setMessage('Transcribing and sorting your voice note…');
      setTranscript('');
      setReview([]);
      const result = await parseVoice.mutateAsync({ data: { audioBase64, mimeType } });
      if (!actorRef.current) return;
      setTranscript(result.transcript);
      const today = stateQuery.data?.today ?? localDateKey();
      const candidates = [...result.tasks.map(task => taskEntry(task, today)), ...result.habits.map(habitEntry)];
      setReview(candidates);
      setMessage(candidates.length
        ? `${candidates.length} suggestions are ready. Nothing is saved until you confirm.`
        : 'No tasks or habits were found in that recording.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      try { file?.delete(); } catch { /* Temporary recording cleanup is best-effort after processing. */ }
      setProcessing(false);
    }
  };

  const stopRecording = async (discard = false) => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await recorderRef.current.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorderRef.current.uri;
      if (uri && discard) {
        try { new File(uri).delete(); } catch { /* Best-effort cleanup of the discarded temporary recording. */ }
        setMessage('Recording discarded.');
      } else if (uri) await processAudioFile(uri);
      else setMessage('The recording could not be read. Please try again.');
    } catch {
      const uri = recorderRef.current.uri;
      if (uri) {
        try { new File(uri).delete(); } catch { /* Best-effort cleanup of the temporary recording. */ }
      }
      setMessage('The recording stopped unexpectedly. Please try again.');
    }
  };

  const startRecording = async () => {
    setMessage('');
    setSettingsNeeded(false);
    if (!await refreshNetwork()) {
      setMessage('Voice entry needs internet. Manual tasks and habits can still be saved as drafts.');
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setSettingsNeeded(!permission.canAskAgain);
        setMessage('Microphone access is needed to capture your plan.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record({ forDuration: 30 });
      recordingRef.current = true;
      setRecording(true);
      timerRef.current = setTimeout(() => { void stopRecording(); }, 30_000);
    } catch {
      setMessage('Could not start the microphone. Check permission and try again.');
    }
  };

  const updateEntry = (id: string, update: Partial<ReviewEntry>) => {
    setReview(entries => entries.map(entry => entry.id === id ? { ...entry, ...update } : entry));
  };

  const selectedCount = review.filter(entry => entry.selected).length;
  const invalidSelection = review.some(entry => entry.selected && (
    !entry.title.trim() || (entry.kind === 'habit' && entry.frequency === 'weekly' && !entry.days.length)
  ));

  const confirmSelected = async () => {
    const selected = review.filter(entry => entry.selected);
    if (!selected.length || invalidSelection || savingItems) return;
    setSavingItems(true);
    setMessage('Adding the items you confirmed…');
    const completed = new Set<string>();
    for (const entry of selected) {
      if (!actorRef.current) break;
      if (await addEntry(entry)) completed.add(entry.id);
    }
    setReview(entries => entries.filter(entry => !completed.has(entry.id)));
    setMessage(completed.size === selected.length
      ? `Added ${completed.size} confirmed item${completed.size === 1 ? '' : 's'}.`
      : completed.size
        ? `Added ${completed.size}. The remaining preview items were not saved; check your connection and confirm again.`
        : 'Nothing was added. Check your connection and confirm again.');
    setSavingItems(false);
  };

  return (
    <View testID="panel-voice-capture">
    <Panel style={styles.panel}>
      <SectionHeading title="PLAN BY VOICE" />
      <MetaText>Record up to 30 seconds. Review and edit every extracted item; nothing is created until you confirm.</MetaText>
      <View style={styles.actions}>
        <PixelButton
          label={recording ? 'STOP & PREVIEW' : online === false ? 'OFFLINE' : 'START RECORDING'}
          onPress={recording ? () => void stopRecording() : () => void startRecording()}
          disabled={processing || parseVoice.isPending || (online === false && !recording)}
          testID={recording ? 'button-stop-voice' : 'button-start-voice'}
        />
        {recording ? <PixelButton label="DISCARD" tone="quiet" onPress={() => void stopRecording(true)} testID="button-cancel-voice" /> : null}
        {settingsNeeded ? (
          <PixelButton label="OPEN SETTINGS" tone="quiet" onPress={() => void Linking.openSettings()} testID="button-open-microphone-settings" />
        ) : null}
      </View>
      {online === false ? <Text testID="status-voice-offline" style={[styles.notice, { color: colors.destructive }]}>Voice needs internet. Manual entries can be saved as drafts.</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" testID="status-voice-processing" style={[styles.notice, { color: colors.cyan }]}>{message}</Text> : null}
      {transcript ? <Text testID="text-voice-transcript" style={[styles.transcript, { color: colors.mutedForeground, borderColor: colors.cyan }]}>{transcript}</Text> : null}

      {review.length ? (
        <View style={styles.reviewSection}>
          <SectionHeading title="REVIEW SUGGESTIONS" />
          {review.map(entry => (
            <View key={entry.id} testID={`card-voice-review-${entry.id}`} style={[styles.reviewCard, { borderColor: colors.border, backgroundColor: colors.sidebar, opacity: entry.selected ? 1 : 0.62 }]}>
              <View style={styles.reviewHeading}>
                <MetaText>{entry.kind.toUpperCase()} · {Math.round(entry.confidence * 100)}% CONFIDENCE</MetaText>
                <ChoiceChip label={entry.selected ? 'INCLUDE' : 'SKIP'} selected={entry.selected} onPress={() => updateEntry(entry.id, { selected: !entry.selected })} testID={`voice-include-${entry.id}`} />
              </View>
              <Field label="TITLE" value={entry.title} onChangeText={title => updateEntry(entry.id, { title })} testID={`input-voice-title-${entry.id}`} />
              <Field label="CATEGORY" value={entry.category} onChangeText={category => updateEntry(entry.id, { category })} testID={`input-voice-category-${entry.id}`} />
              {entry.kind === 'task' ? (
                <>
                  <Field label="DUE DATE" value={entry.dueDate} onChangeText={dueDate => updateEntry(entry.id, { dueDate })} placeholder="YYYY-MM-DD" maxLength={10} testID={`input-voice-date-${entry.id}`} />
                  <View style={styles.choiceRow}>
                    {(['easy', 'medium', 'hard'] as const).map(level => <ChoiceChip key={level} label={level.toUpperCase()} selected={entry.difficulty === level} onPress={() => updateEntry(entry.id, { difficulty: level })} testID={`voice-difficulty-${entry.id}-${level}`} />)}
                    <ChoiceChip label="PRIORITY" selected={entry.priority} onPress={() => updateEntry(entry.id, { priority: !entry.priority })} testID={`voice-priority-${entry.id}`} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.choiceRow}>
                    <ChoiceChip label="DAILY" selected={entry.frequency === 'daily'} onPress={() => updateEntry(entry.id, { frequency: 'daily', days: allDays })} testID={`voice-frequency-daily-${entry.id}`} />
                    <ChoiceChip label="WEEKLY" selected={entry.frequency === 'weekly'} onPress={() => updateEntry(entry.id, { frequency: 'weekly' })} testID={`voice-frequency-weekly-${entry.id}`} />
                  </View>
                  {entry.frequency === 'weekly' ? <View style={styles.choiceRow}>
                    {weekdays.map((day, index) => <ChoiceChip key={day} label={day} selected={entry.days.includes(index)} onPress={() => updateEntry(entry.id, { days: entry.days.includes(index) ? entry.days.filter(value => value !== index) : [...entry.days, index].sort((a, b) => a - b) })} testID={`voice-day-${entry.id}-${index}`} />)}
                  </View> : null}
                </>
              )}
            </View>
          ))}
          <PixelButton
            label={savingItems ? 'ADDING…' : `CONFIRM & ADD ${selectedCount}`}
            onPress={() => void confirmSelected()}
            disabled={!selectedCount || invalidSelection || savingItems}
            testID="button-confirm-voice-items"
          />
        </View>
      ) : null}
    </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { fontSize: 12, lineHeight: 18 },
  transcript: { borderLeftWidth: 2, paddingLeft: 10, fontSize: 12, lineHeight: 18 },
  reviewSection: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#464253', paddingTop: 12 },
  reviewHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewCard: { gap: 10, borderWidth: 1, padding: 12 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
