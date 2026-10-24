import { z } from "zod/v4";

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
]);

const ExtractionSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    category: z.string().trim().max(40).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    priority: z.boolean().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })).max(12),
  habits: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    category: z.string().trim().max(40).optional(),
    frequency: z.enum(["daily", "weekly"]).optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })).max(12),
});

export class VoiceProcessingError extends Error {
  readonly status: 400 | 429 | 502 | 503;
  constructor(message: string, status: 400 | 429 | 502 | 503) {
    super(message);
    this.name = "VoiceProcessingError";
    this.status = status;
  }
}

export function decodeVoiceAudio(audioBase64: string, mimeType: string): Buffer {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new VoiceProcessingError("This audio format is not supported.", 400);
  }
  if (
    audioBase64.length === 0 ||
    audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64)
  ) {
    throw new VoiceProcessingError("The audio recording is invalid or too large.", 400);
  }
  const audio = Buffer.from(audioBase64, "base64");
  if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES || audio.toString("base64") !== audioBase64) {
    throw new VoiceProcessingError("The audio recording is invalid or too large.", 400);
  }
  return audio;
}

function providerText(value: unknown): string {
  if (!value || typeof value !== "object") throw new VoiceProcessingError("Voice processing returned an invalid response.", 502);
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) throw new VoiceProcessingError("Voice processing returned an invalid response.", 502);
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) throw new VoiceProcessingError("Voice processing returned an invalid response.", 502);
  const text = parts.map(part => part && typeof part === "object" ? (part as { text?: unknown }).text : null)
    .filter((part): part is string => typeof part === "string").join("\n").trim();
  if (!text) throw new VoiceProcessingError("Voice processing returned an empty response.", 502);
  return text;
}

async function generateContent(model: string, parts: unknown[], maxOutputTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new VoiceProcessingError("Voice processing is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens },
      }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    throw new VoiceProcessingError("Could not reach the voice processing service. Please try again.", 502);
  }
  if (!response.ok) {
    throw new VoiceProcessingError("The voice processing service could not complete this request.", 502);
  }
  try {
    return providerText(await response.json());
  } catch (error) {
    if (error instanceof VoiceProcessingError) throw error;
    throw new VoiceProcessingError("Voice processing returned an invalid response.", 502);
  }
}

function parseJsonObject(raw: string): unknown {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new VoiceProcessingError("Could not understand the recording. Please try again.", 502);
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  } catch {
    throw new VoiceProcessingError("Could not understand the recording. Please try again.", 502);
  }
}

export function parseGemmaExtraction(raw: string, transcript: string) {
  const parsed = ExtractionSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) throw new VoiceProcessingError("Could not understand the recording. Please try again.", 502);

  const unique = <T extends { title: string }>(items: T[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.title.normalize("NFKC").toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const tasks = unique(parsed.data.tasks).map(task => ({
    ...task,
    confidence: task.confidence ?? 0.45,
    dueDate: task.dueDate ?? null,
  }));
  const habits = unique(parsed.data.habits).map(habit => {
    const frequency = habit.frequency;
    const days = frequency === "daily"
      ? [0, 1, 2, 3, 4, 5, 6]
      : [...new Set(habit.days ?? [])].sort((a, b) => a - b);
    const needsScheduleReview = !frequency || (frequency === "weekly" && days.length === 0);
    return {
      ...habit,
      frequency: frequency ?? "daily",
      days,
      confidence: needsScheduleReview ? Math.min(habit.confidence ?? 0.45, 0.49) : (habit.confidence ?? 0.45),
    };
  });

  return {
    transcript: transcript.trim().slice(0, 4000),
    tasks,
    habits,
  };
}

export async function parseVoiceAudio(audio: Buffer, mimeType: string) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new VoiceProcessingError("This audio format is not supported.", 400);
  }
  const normalizedMimeType = mimeType === "audio/m4a" ? "audio/mp4" : mimeType;
  const transcript = await generateContent("gemini-2.5-flash", [
    { text: "Transcribe the speech in this audio verbatim in its original language. Return only the transcript. Do not summarize or translate it." },
    { inline_data: { mime_type: normalizedMimeType, data: audio.toString("base64") } },
  ], 4096);
  if (transcript.length > 4000) {
    throw new VoiceProcessingError("The recording is too long. Please keep it under 30 seconds.", 400);
  }
  const extraction = await generateContent("gemma-4-26b-a4b-it", [{
    text: [
      "Extract actionable items from the transcript below. Return only one JSON object with exactly two arrays: tasks and habits.",
      'Each task: {"title": string, "category"?: string, "difficulty"?: "easy"|"medium"|"hard", "priority"?: boolean, "dueDate"?: "YYYY-MM-DD"|null, "confidence": number from 0 to 1}.',
      'Each habit: {"title": string, "category"?: string, "frequency"?: "daily"|"weekly", "days"?: number[], "confidence": number from 0 to 1}.',
      "Use day numbers Sunday=0 through Saturday=6. Use frequency daily with days [0,1,2,3,4,5,6] for daily habits. For weekly habits include only explicitly stated days.",
      "Treat a one-time action as a task and a repeated commitment as a habit. Do not invent items, dates, or schedules. Do not include XP, gold, rewards, completion state, or game rules.",
      "Preserve the speaker's language in titles. If an item or its schedule is unclear, lower its confidence below 0.8 so the user can review it.",
      "Transcript:",
      transcript,
    ].join("\n"),
  }], 2048);

  return parseGemmaExtraction(extraction, transcript);
}
