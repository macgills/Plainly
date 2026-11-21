import assert from "node:assert/strict";
import test from "node:test";
import { simplifyWithBrowserAI } from "../extension/browser-ai.js";

const payload = { readingTarget: { schemeId: "oxford", level: "8" }, blocks: [{ id: "one", text: "Original fact: 12." }] };

test("built-in AI adapter requires no API key and returns matching blocks", async () => {
  const old = globalThis.LanguageModel;
  let destroyed = false;
  try {
    globalThis.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async (instruction) => {
          assert.match(instruction, /Original fact: 12/);
          return "A simpler fact: 12.";
        },
        destroy: () => { destroyed = true; },
      }),
    };
    assert.deepEqual(await simplifyWithBrowserAI({ payload }), [{ id: "one", text: "A simpler fact: 12." }]);
    assert.equal(destroyed, true);
  } finally { globalThis.LanguageModel = old; }
});

test("unsupported devices fail clearly without paid fallback", async () => {
  const old = globalThis.LanguageModel;
  try {
    globalThis.LanguageModel = undefined;
    await assert.rejects(simplifyWithBrowserAI({ payload }), /does not offer/);
    globalThis.LanguageModel = { availability: async () => "unavailable", create: async () => { throw Error("must not create"); } };
    await assert.rejects(simplifyWithBrowserAI({ payload }), /unavailable/);
  } finally { globalThis.LanguageModel = old; }
});
