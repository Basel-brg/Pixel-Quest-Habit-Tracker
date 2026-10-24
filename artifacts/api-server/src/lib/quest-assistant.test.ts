import assert from "node:assert/strict";
import { after, test } from "node:test";
import { QuestAssistantError, suggestQuestDraft } from "./quest-assistant.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

function mockProvider(value: unknown) {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /gemini-2\.5-flash:generateContent/);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-gemini-key");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("habit suggestions normalize daily schedules and preserve numeric targets", async () => {
  mockProvider({
    title: "شرب الماء",
    category: "Health",
    stat: "STR",
    target: 2.5,
    unit: "لتر",
    frequency: "daily",
    days: [],
  });

  const suggestion = await suggestQuestDraft("habit", "اشرب 2.5 لتر ماء يومياً", "2026-10-24");
  assert.equal(suggestion.itemType, "habit");
  assert.equal(suggestion.target, 2.5);
  assert.equal(suggestion.unit, "لتر");
  assert.equal(suggestion.stat, "STR");
  assert.equal(suggestion.frequency, "daily");
  assert.deepEqual(suggestion.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(suggestion.dueDate, null);
});

test("quest suggestions default a missing due date to the account's today", async () => {
  mockProvider({
    title: "Study math",
    difficulty: "medium",
    stat: "INT",
    frequency: "daily",
    days: [0, 1, 2, 3, 4, 5, 6],
  });

  const suggestion = await suggestQuestDraft("quest", "Study math for one hour today", "2026-10-24");
  assert.equal(suggestion.dueDate, "2026-10-24");
  assert.equal(suggestion.difficulty, "medium");
  assert.equal(suggestion.stat, "INT");
  assert.equal(suggestion.priority, false);
});

test("invalid AI dates fall back to today rather than blocking the editable draft", async () => {
  mockProvider({ title: "Walk", difficulty: "easy", dueDate: "tomorrow" });
  const suggestion = await suggestQuestDraft("quest", "Walk tomorrow", "2026-10-24");
  assert.equal(suggestion.dueDate, "2026-10-24");
});

test("malformed provider output fails explicitly instead of creating a draft", async () => {
  mockProvider({ title: "", unexpected: true });
  await assert.rejects(
    suggestQuestDraft("quest", "do something", "2026-10-24"),
    (error: unknown) => error instanceof QuestAssistantError && error.status === 502,
  );
});

test("missing Gemini configuration returns a clear service-unavailable error", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    suggestQuestDraft("habit", "read daily", "2026-10-24"),
    (error: unknown) => error instanceof QuestAssistantError && error.status === 503,
  );
});
