import assert from "node:assert/strict";
import { after, test } from "node:test";
import { RewardAssistantError, suggestRewardDraft } from "./reward-assistant.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

function provider(value: unknown, status = 200) {
  process.env.GEMINI_API_KEY = "test-only-key";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-only-key");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    }), { status, headers: { "Content-Type": "application/json" } });
  };
}

test("reward suggestions preserve Arabic text and separate level from Gold cost", async () => {
  provider({ title: "قهوة من الكافيه", category: "شخصي", description: "", requiredLevel: 2, claimCost: 50 });
  const result = await suggestRewardDraft("قهوة من الكافيه");
  assert.equal(result.title, "قهوة من الكافيه");
  assert.equal(result.requiredLevel, 2);
  assert.equal(result.claimCost, 50);
  assert.equal("savingsTarget" in result, false);
});

test("unsafe gates, fractional Gold and blank titles are rejected", async () => {
  for (const bad of [
    { requiredLevel: 101, claimCost: 50, title: "Coffee" },
    { requiredLevel: 2, claimCost: -50, title: "Coffee" },
    { requiredLevel: 2, claimCost: 1.5, title: "Coffee" },
    { requiredLevel: 2, claimCost: 50, title: "  " },
  ]) {
    provider(bad);
    await assert.rejects(suggestRewardDraft("Coffee"), (e: unknown) => e instanceof RewardAssistantError && e.status === 502);
  }
});

test("provider failures keep suggestion errors explicit", async () => {
  provider({}, 429);
  await assert.rejects(suggestRewardDraft("Coffee"), (e: unknown) => e instanceof RewardAssistantError && e.status === 502);
});

test("missing configuration returns service unavailable", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(suggestRewardDraft("Coffee"), (e: unknown) => e instanceof RewardAssistantError && e.status === 503);
});
