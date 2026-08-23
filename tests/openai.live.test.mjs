import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL, simplifyWithOpenAI } from "../extension/openai.js";
import { resolvePromptTarget } from "../tools/kmp-reading-target.mjs";

const apiKey = process.env.AI_SECRET;
const readingTarget = resolvePromptTarget({ scheme: "oxford", level: "8" });
const payload = {
  title: "Photosynthesis",
  readingTarget: readingTarget.prompt,
  blocks: [{
    id: "stable-key-live-0",
    text: "Photosynthesis is a system of biological processes by which photosynthetic organisms, such as most plants, algae, and cyanobacteria, convert light energy, typically from sunlight, into the chemical energy necessary to fuel their activities.",
  }],
};

test("production OpenAI adapter succeeds with a KMP-resolved target", async (t) => {
  if (!apiKey) return t.skip("AI_SECRET is required");

  const result = await simplifyWithOpenAI({ apiKey, payload });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "stable-key-live-0");
  assert.ok(result[0].text.trim().length > 0);
  assert.notEqual(result[0].text.trim(), payload.blocks[0].text);

  console.log(`Live OpenAI adapter succeeded with ${DEFAULT_MODEL} at ${readingTarget.label}; adjusted ${result[0].text.length} characters.`);
});
