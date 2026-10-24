import { useEffect, useRef, useState } from "react";
import { Check, Mic, Plus, Square, X } from "lucide-react";
import { useParseVoice } from "@workspace/api-client-react";
import type { VoiceAudioInputMimeType, VoiceHabit, VoiceParseResult, VoiceTask } from "@workspace/api-client-react";
import { Btn, Panel, SectionHead } from "@/components/kit";
import { useRpg } from "@/lib/rpg-context";

type ReviewEntry = {
  id: string;
  kind: "task" | "habit";
  title: string;
  category: string;
  confidence: number;
  difficulty: "easy" | "medium" | "hard";
  priority: boolean;
  dueDate: string;
  frequency: "daily" | "weekly";
  days: number[];
  selected: boolean;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const daySet = [0, 1, 2, 3, 4, 5, 6];

function toReview(task: VoiceTask, today: string): ReviewEntry {
  return {
    id: crypto.randomUUID(),
    kind: "task",
    title: task.title,
    category: task.category ?? "General",
    confidence: task.confidence,
    difficulty: task.difficulty ?? "medium",
    priority: task.priority ?? false,
    dueDate: task.dueDate ?? today,
    frequency: "daily",
    days: daySet,
    selected: true,
  };
}

function habitToReview(habit: VoiceHabit): ReviewEntry {
  return {
    id: crypto.randomUUID(),
    kind: "habit",
    title: habit.title,
    category: habit.category ?? "Personal",
    confidence: habit.confidence,
    difficulty: "medium",
    priority: false,
    dueDate: "",
    frequency: habit.frequency ?? "daily",
    days: habit.days ?? [],
    selected: true,
  };
}

function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not read the recording."));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function errorMessage(error: unknown): string {
  const value = error as { data?: { error?: string }; message?: string };
  return value?.data?.error ?? value?.message ?? "Voice processing failed. Please try again.";
}

export function VoiceCapture({ today }: { today: string }) {
  const { run, userId } = useRpg();
  const parseVoice = useParseVoice();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const cancelRef = useRef(false);
  const actorRef = useRef(userId);
  actorRef.current = userId;
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [review, setReview] = useState<ReviewEntry[]>([]);
  const [savingItems, setSavingItems] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearTimeout(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        cancelRef.current = true;
        recorderRef.current.stop();
      }
      recorderRef.current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const addEntry = async (entry: ReviewEntry) => {
    if (!actorRef.current) return false;
    const input = entry.kind === "task"
      ? {
          action: "saveQuest" as const,
          title: entry.title.trim(),
          category: entry.category.trim() || "General",
          difficulty: entry.difficulty,
          priority: entry.priority,
          dueDate: entry.dueDate || today || null,
          type: "single" as const,
          tags: [],
        }
      : {
          action: "saveHabit" as const,
          title: entry.title.trim(),
          category: entry.category.trim() || "Personal",
          frequency: entry.frequency,
          days: entry.frequency === "daily" ? daySet : entry.days,
        };
    const result = await run(input, { key: `voice:${entry.id}`, requestId: entry.id });
    return !!result;
  };

  const processRecording = async (blob: Blob) => {
    if (!navigator.onLine) {
      setMessage("Voice entry needs an internet connection. This recording was discarded.");
      return;
    }
    setProcessing(true);
    setMessage("Transcribing and sorting your voice note…");
    setTranscript("");
    setReview([]);
    try {
      const rawMimeType = blob.type.split(";")[0]?.toLowerCase() ?? "";
      const mimeType = rawMimeType === "audio/x-m4a" ? "audio/m4a" : rawMimeType;
      const acceptedMimeTypes: VoiceAudioInputMimeType[] = ["audio/webm", "audio/mp4", "audio/m4a", "audio/aac", "audio/ogg", "audio/wav", "audio/mpeg"];
      if (!acceptedMimeTypes.includes(mimeType as VoiceAudioInputMimeType)) {
        throw new Error("This browser produced an unsupported audio format.");
      }
      const audioBase64 = await base64FromBlob(blob);
      const result: VoiceParseResult = await parseVoice.mutateAsync({ data: { audioBase64, mimeType: mimeType as VoiceAudioInputMimeType } });
      if (!actorRef.current) return;
      setTranscript(result.transcript);
      const candidates = [...result.tasks.map(task => toReview(task, today)), ...result.habits.map(habitToReview)];
      setReview(candidates);
      setMessage(candidates.length
        ? `${candidates.length} suggestions are ready. Nothing is saved until you confirm.`
        : "No tasks or habits were found in that recording.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    setMessage("");
    if (!navigator.onLine) {
      setMessage("Voice entry needs an internet connection. Manual tasks and habits can still be saved as drafts.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("This browser does not support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelRef.current = false;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        setMessage("The recording stopped unexpectedly. Please try again.");
      };
      recorder.onstop = () => {
        window.clearTimeout(timerRef.current);
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        if (cancelRef.current) {
          cancelRef.current = false;
          chunksRef.current = [];
          setMessage("Recording discarded.");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        void processRecording(blob);
      };
      recorder.start();
      setRecording(true);
      timerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 30_000);
    } catch {
      setMessage("Microphone access was not granted. Allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
  const cancelRecording = () => {
    cancelRef.current = true;
    stopRecording();
  };

  const updateEntry = (id: string, update: Partial<ReviewEntry>) => {
    setReview(entries => entries.map(entry => entry.id === id ? { ...entry, ...update } : entry));
  };

  const selectedCount = review.filter(entry => entry.selected).length;
  const invalidSelection = review.some(entry => entry.selected && (
    !entry.title.trim() || (entry.kind === "habit" && entry.frequency === "weekly" && !entry.days.length)
  ));

  const confirmSelected = async () => {
    const selected = review.filter(entry => entry.selected);
    if (!selected.length || invalidSelection || savingItems) return;
    setSavingItems(true);
    setMessage("Adding the items you confirmed…");
    const completed = new Set<string>();
    for (const entry of selected) {
      if (!actorRef.current) break;
      if (await addEntry(entry)) completed.add(entry.id);
    }
    setReview(entries => entries.filter(entry => !completed.has(entry.id)));
    setMessage(completed.size === selected.length
      ? `Added ${completed.size} confirmed item${completed.size === 1 ? "" : "s"}.`
      : completed.size
        ? `Added ${completed.size}. The remaining preview items were not saved; check your connection and confirm again.`
        : "Nothing was added. Check your connection and confirm again.");
    setSavingItems(false);
  };

  return <Panel data-testid="panel-voice-capture">
    <SectionHead eyebrow="VOICE PLANNING" title="Speak your plan"/>
    <p className="mb-4 text-xs text-[color:var(--pq-mute)]">Record up to 30 seconds. Review and edit every extracted item; nothing is created until you confirm.</p>
    <div className="flex flex-wrap gap-2">
      {!recording
        ? <Btn testId="button-start-voice" onClick={() => void startRecording()} disabled={processing || parseVoice.isPending || !online}><Mic size={15}/> {online ? "Start recording" : "Offline"}</Btn>
        : <>
          <Btn testId="button-stop-voice" onClick={stopRecording}><Square size={14}/> Stop & preview</Btn>
          <Btn testId="button-cancel-voice" variant="quiet" onClick={cancelRecording}><X size={14}/> Discard</Btn>
        </>}
      {!online && <span data-testid="status-voice-offline" className="self-center text-xs text-[color:var(--pq-danger)]">Voice needs internet. Manual entries can be saved as drafts.</span>}
    </div>
    {(processing || message) && <p data-testid="status-voice-processing" aria-live="polite" className="mt-3 text-xs text-[color:var(--pq-cyan)]">{message}</p>}
    {transcript && <p data-testid="text-voice-transcript" className="mt-3 border-l-2 border-[color:var(--pq-cyan)] pl-3 text-xs text-[color:var(--pq-mute)]">{transcript}</p>}
    {!!review.length && <div className="mt-4 space-y-3 border-t border-[color:var(--pq-line2)] pt-4">
      <h3 className="font-mono text-[10px] uppercase text-[color:var(--pq-gold)]">Preview · confirm before saving</h3>
      {review.map(entry => <article key={entry.id} data-testid={`card-voice-review-${entry.id}`} className={`space-y-3 border border-[color:var(--pq-line2)] bg-[color:var(--pq-panel2)] p-3 ${entry.selected ? "" : "opacity-60"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[9px] uppercase text-[color:var(--pq-mute)]">{entry.kind} · {Math.round(entry.confidence * 100)}% confidence</p>
          <label className="flex items-center gap-2 text-xs text-[color:var(--pq-cyan)]">
            <input data-testid={`checkbox-voice-include-${entry.id}`} type="checkbox" checked={entry.selected} onChange={event => updateEntry(entry.id, { selected: event.target.checked })}/>
            Include
          </label>
        </div>
        <label className="block text-[10px] text-[color:var(--pq-mute)]">Title
          <input data-testid={`input-voice-title-${entry.id}`} value={entry.title} onChange={event => updateEntry(entry.id, { title: event.target.value })} className="field mt-1 w-full"/>
        </label>
        <label className="block text-[10px] text-[color:var(--pq-mute)]">Category
          <input data-testid={`input-voice-category-${entry.id}`} value={entry.category} onChange={event => updateEntry(entry.id, { category: event.target.value })} className="field mt-1 w-full"/>
        </label>
        {entry.kind === "task" ? <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[10px] text-[color:var(--pq-mute)]">Difficulty
              <select data-testid={`select-voice-difficulty-${entry.id}`} value={entry.difficulty} onChange={event => updateEntry(entry.id, { difficulty: event.target.value as ReviewEntry["difficulty"] })} className="field mt-1 w-full">
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
            <label className="block text-[10px] text-[color:var(--pq-mute)]">Due date
              <input data-testid={`input-voice-date-${entry.id}`} type="date" value={entry.dueDate} onChange={event => updateEntry(entry.id, { dueDate: event.target.value })} className="field mt-1 w-full"/>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-[color:var(--pq-mute)]">
            <input data-testid={`checkbox-voice-priority-${entry.id}`} type="checkbox" checked={entry.priority} onChange={event => updateEntry(entry.id, { priority: event.target.checked })}/>
            Mark as priority
          </label>
        </> : <>
          <label className="block text-[10px] text-[color:var(--pq-mute)]">Frequency
            <select data-testid={`select-voice-frequency-${entry.id}`} value={entry.frequency} onChange={event => updateEntry(entry.id, { frequency: event.target.value as ReviewEntry["frequency"], days: event.target.value === "daily" ? daySet : entry.days })} className="field mt-1 w-full">
              <option value="daily">Daily</option><option value="weekly">Weekly</option>
            </select>
          </label>
          {entry.frequency === "weekly" && <div className="flex flex-wrap gap-2">{weekdays.map((day, index) => <label key={day} className="flex items-center gap-1 text-[10px] text-[color:var(--pq-mute)]">
            <input data-testid={`checkbox-voice-day-${entry.id}-${index}`} type="checkbox" checked={entry.days.includes(index)} onChange={event => updateEntry(entry.id, { days: event.target.checked ? [...entry.days, index].sort((a, b) => a - b) : entry.days.filter(value => value !== index) })}/>{day}
          </label>)}</div>}
        </>}
        <div className="flex justify-end gap-2">
          <Btn testId={`button-dismiss-voice-${entry.id}`} variant="quiet" onClick={() => setReview(items => items.filter(item => item.id !== entry.id))}><X size={13}/> Remove</Btn>
        </div>
      </article>)}
      <div className="flex justify-end">
        <Btn testId="button-confirm-voice-items" disabled={!selectedCount || invalidSelection || savingItems} onClick={() => void confirmSelected()}>
          <Check size={14}/>{savingItems ? "Adding…" : `Confirm & add selected (${selectedCount})`}
        </Btn>
      </div>
    </div>}
  </Panel>;
}
