import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REWRITING_PROVIDER,
  availableRewritingProviders,
  simplifyWithProvider,
} from "../extension/rewriting-provider.js";

const payload = {
  readingTarget: { schemeId: "oxford", level: "8" },
  blocks: [
    { id: "first", text: "Original first." },
    { id: "second", text: "Original second." },
  ],
};

test("keyless browser AI is the default rewriting provider", () => {
  assert.equal(DEFAULT_REWRITING_PROVIDER, "browser-ai");
  assert.deepEqual(availableRewritingProviders(), ["openai", "browser-ai"]);
});

test("passes the reading target and blocks to a replaceable adapter", async () => {
  let received;
  const result = await simplifyWithProvider({
    provider: "fixture",
    apiKey: "test-only",
    payload,
    adapters: {
      fixture: async (request) => {
        received = request;
        return [
          { id: "second", text: "Simpler second." },
          { id: "first", text: "Simpler first." },
        ];
      },
    },
  });
  assert.deepEqual(received, { apiKey: "test-only", payload });
  assert.deepEqual(result, [
    { id: "first", text: "Simpler first." },
    { id: "second", text: "Simpler second." },
  ]);
});

test("rejects unsupported providers without falling back silently", async () => {
  await assert.rejects(
    simplifyWithProvider({ provider: "missing", payload }),
    /Unsupported Plainly rewriting provider/,
  );
});

test("rejects missing, duplicate and empty rewritten blocks", async () => {
  for (const blocks of [
    [{ id: "first", text: "Only one." }],
    [{ id: "first", text: "One." }, { id: "first", text: "Duplicate." }],
    [{ id: "first", text: "One." }, { id: "second", text: " " }],
    [{ id: "first", text: "One." }, { id: "wrong", text: "Other." }],
  ]) {
    await assert.rejects(
      simplifyWithProvider({
        provider: "fixture",
        payload,
        adapters: { fixture: async () => blocks },
      }),
      /invalid|omitted/,
    );
  }
});

test("propagates provider errors so the existing fail-open path can restore original text", async () => {
  await assert.rejects(
    simplifyWithProvider({
      provider: "fixture",
      payload,
      adapters: { fixture: async () => { throw new Error("service unavailable"); } },
    }),
    /service unavailable/,
  );
});
