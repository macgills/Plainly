import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { simplifyWithOpenAI } from "../extension/openai.js";
import { getReadingTarget, READING_SCHEMES } from "../extension/reading-targets.js";

const TEST_KEY = "sk-test-plainly-integration-key";

test("defines Oxford and F&P target ranges", () => {
  assert.deepEqual(READING_SCHEMES.oxford.levels.slice(0, 3), ["1", "1+", "2"]);
  assert.equal(READING_SCHEMES.oxford.levels.at(-1), "20");
  assert.equal(READING_SCHEMES.fountasPinnell.levels.length, 26);
  assert.equal(READING_SCHEMES.fountasPinnell.levels.at(0), "A");
  assert.equal(READING_SCHEMES.fountasPinnell.levels.at(-1), "Z");
});

for (const target of [
  { scheme: "oxford", level: "8", expectedScheme: "Oxford Reading Tree" },
  { scheme: "fountasPinnell", level: "M", expectedScheme: "Fountas & Pinnell" },
]) {
  test(`calls Responses API with ${target.expectedScheme} ${target.level} guidance`, async () => {
    let receivedBody;
    const server = createServer(async (request, response) => {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ blocks: [{ id: "block-0", text: "Plants turn light into usable energy." }] }) }] }] }));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address();
    try {
      const result = await simplifyWithOpenAI({
        apiKey: TEST_KEY,
        apiUrl: `http://127.0.0.1:${port}/v1/responses`,
        model: "gpt-5-mini",
        payload: { title: "Photosynthesis", scheme: target.scheme, level: target.level, blocks: [{ id: "block-0", text: "Photosynthesis converts light energy into chemical energy used by living organisms." }] },
      });
      const userPayload = JSON.parse(receivedBody.input[1].content[0].text);
      assert.equal(receivedBody.model, "gpt-5-mini");
      assert.equal(receivedBody.store, false);
      assert.equal(userPayload.readingTarget.scheme, target.expectedScheme);
      assert.equal(userPayload.readingTarget.level, target.level);
      assert.deepEqual(result, [{ id: "block-0", text: "Plants turn light into usable energy." }]);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
}

test("Oxford and F&P profiles remain distinct", () => {
  assert.match(getReadingTarget("oxford", "8").guidance, /short-to-medium/i);
  assert.equal(getReadingTarget("fountasPinnell", "M").label, "F&P M");
});
