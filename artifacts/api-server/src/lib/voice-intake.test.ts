import assert from "node:assert/strict";
import test from "node:test";
import { decodeVoiceAudio, parseGemmaExtraction, parseVoiceAudio, VoiceProcessingError } from "./voice-intake.ts";

test("voice audio is decoded only for supported formats", () => {
  const payload = Buffer.from("short audio").toString("base64");
  assert.equal(decodeVoiceAudio(payload, "audio/webm").toString(), "short audio");
  assert.throws(
    () => decodeVoiceAudio(payload, "text/plain"),
    (error: unknown) => error instanceof VoiceProcessingError && error.status === 400,
  );
  assert.throws(
    () => decodeVoiceAudio("not base64!", "audio/webm"),
    (error: unknown) => error instanceof VoiceProcessingError && error.status === 400,
  );
});

test("Gemma extraction is normalized and keeps ambiguous weekly habits for review", () => {
  const result = parseGemmaExtraction(JSON.stringify({
    tasks: [
      { title: "  Read chapter  ", confidence: 0.92, difficulty: "medium" },
      { title: "read chapter", confidence: 0.9 },
    ],
    habits: [
      { title: "Walk", frequency: "daily", confidence: 0.95 },
      { title: "Practice guitar", frequency: "weekly", days: [], confidence: 0.99 },
    ],
  }), "اقرأ الفصل وامشِ يومياً");

  assert.equal(result.transcript, "اقرأ الفصل وامشِ يومياً");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0]?.title, "Read chapter");
  assert.deepEqual(result.habits[0]?.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(result.habits[1]?.confidence, 0.49);
});

test("invalid model JSON fails explicitly instead of creating empty records", () => {
  assert.throws(
    () => parseGemmaExtraction("not JSON", "some words"),
    (error: unknown) => error instanceof VoiceProcessingError && error.status === 502,
  );
});

test("voice processing transcribes first, then asks Gemma for structured suggestions", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-not-a-credential";
  const urls: string[] = [];
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const text = urls.length === 1
      ? "أدرس يومياً وأتصل بالطبيب اليوم"
      : JSON.stringify({
          tasks: [{ title: "الاتصال بالطبيب", dueDate: null, confidence: 0.91 }],
          habits: [{ title: "الدراسة", frequency: "daily", days: [0, 1, 2, 3, 4, 5, 6], confidence: 0.95 }],
        });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await parseVoiceAudio(Buffer.from("temporary-audio"), "audio/webm");
    assert.match(urls[0] ?? "", /gemini-2\.5-flash:generateContent$/);
    assert.match(urls[1] ?? "", /gemma-4-26b-a4b-it:generateContent$/);
    assert.equal(result.transcript, "أدرس يومياً وأتصل بالطبيب اليوم");
    assert.equal(result.tasks[0]?.title, "الاتصال بالطبيب");
    assert.equal(result.habits[0]?.frequency, "daily");
    const firstParts = requestBodies[0]?.contents as Array<{ parts?: Array<{ inline_data?: { mime_type?: string } }> }>;
    assert.equal(firstParts[0]?.parts?.[1]?.inline_data?.mime_type, "audio/webm");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
