import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_VERBOSITY,
  simplifyWithOpenAI,
} from "../extension/openai.js";

const TEST_KEY = "sk-test-plainly-integration-key";
const CITATION_MARKER = "⟦PLAINLY_CITATION_A⟧";

test("calls the OpenAI Responses API with protected source semantics and maps structured blocks", async () => {
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
            blocks: [{
              id: "stable-key-0",
              text: `Phototrophic organisms turn light into usable energy.${CITATION_MARKER} This process stores that energy chemically.`,
            }],
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
          id: "stable-key-0",
          text: `Photosynthesis is a system of biological processes by which phototrophic organisms convert light energy into chemical energy.${CITATION_MARKER} The stored energy can be used later.`,
          protectedLinkTexts: ["phototrophic organisms"],
          protectedCitationMarkers: [CITATION_MARKER],
        }],
      },
    });

    assert.equal(receivedAuthorization, `Bearer ${TEST_KEY}`);
    assert.equal(receivedBody.model, "gpt-5-mini");
    assert.equal(receivedBody.store, false);
    assert.equal(receivedBody.reasoning.effort, DEFAULT_REASONING_EFFORT);
    assert.equal(receivedBody.text.verbosity, DEFAULT_VERBOSITY);
    assert.equal(receivedBody.text.format.type, "json_schema");
    assert.match(receivedBody.input[0].content[0].text, /Do not add facts, definitions/);
    assert.match(receivedBody.input[0].content[0].text, /protectedLinkTexts/);
    assert.match(receivedBody.input[0].content[0].text, /protectedCitationMarkers/);
    assert.match(receivedBody.input[0].content[0].text, /Copy every marker exactly once/);

    const providerInput = JSON.parse(receivedBody.input[1].content[0].text);
    assert.equal(providerInput.title, "Photosynthesis");
    assert.deepEqual(providerInput.blocks[0].protectedLinkTexts, ["phototrophic organisms"]);
    assert.deepEqual(providerInput.blocks[0].protectedCitationMarkers, [CITATION_MARKER]);
    assert.match(providerInput.blocks[0].text, new RegExp(CITATION_MARKER));
    assert.deepEqual(result, [{
      id: "stable-key-0",
      text: `Phototrophic organisms turn light into usable energy.${CITATION_MARKER} This process stores that energy chemically.`,
    }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
