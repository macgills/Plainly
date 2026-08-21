import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { simplifyWithOpenAI } from "../extension/openai.js";

const TEST_KEY = "sk-test-plainly-integration-key";

test("calls the OpenAI Responses API with the user key and maps structured blocks", async () => {
  let receivedAuthorization;
  let receivedBody;

  const server = createServer(async (request, response) => {
    receivedAuthorization = request.headers.authorization;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            blocks: [{ id: "block-0", text: "Plants turn light into usable energy." }],
          }),
        }],
      }],
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const result = await simplifyWithOpenAI({
      apiKey: TEST_KEY,
      apiUrl: `http://127.0.0.1:${port}/v1/responses`,
      model: "gpt-5-mini",
      payload: {
        title: "Photosynthesis",
        level: 2,
        blocks: [{
          id: "block-0",
          text: "Photosynthesis is a system of biological processes by which phototrophic organisms convert light energy into chemical energy.",
        }],
      },
    });

    assert.equal(receivedAuthorization, `Bearer ${TEST_KEY}`);
    assert.equal(receivedBody.model, "gpt-5-mini");
    assert.equal(receivedBody.store, false);
    assert.equal(receivedBody.text.format.type, "json_schema");
    assert.match(receivedBody.input[1].content[0].text, /Photosynthesis/);
    assert.deepEqual(result, [{ id: "block-0", text: "Plants turn light into usable energy." }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
