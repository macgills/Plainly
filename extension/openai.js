export const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_MODEL = "gpt-5-mini";
export const DEFAULT_REASONING_EFFORT = "minimal";
export const DEFAULT_VERBOSITY = "low";

const LEVEL_GUIDANCE = Object.freeze({
  1: "Use very common words, short sentences, one main idea per sentence, and explain essential subject words in simple language only when the source itself explains them.",
  2: "Use common vocabulary and mostly short sentences. Keep essential subject vocabulary, but explain unfamiliar terms only when the source itself provides that explanation.",
  3: "Use clear secondary-school language. Reduce sentence complexity while preserving important domain terminology and nuance.",
});

export async function simplifyWithOpenAI({
  apiKey,
  payload,
  apiUrl = DEFAULT_OPENAI_API_URL,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
}) {
  validateApiKey(apiKey);
  validatePayload(payload);

  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: {
        effort: DEFAULT_REASONING_EFFORT,
      },
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: [
              "You adjust Wikipedia prose to a specified reading level.",
              "Use only information present in the supplied source text.",
              "Do not add facts, definitions, examples, explanations, causes, or conclusions from your own knowledge.",
              "Preserve names, dates, numbers, uncertainty, comparisons, negation, and the meaning of technical terms.",
              "Simplify syntax and vocabulary without removing information needed to understand the source.",
              "Return one adjusted string for every supplied block id.",
            ].join(" "),
          }],
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              title: payload.title ?? "",
              level: payload.level,
              guidance: LEVEL_GUIDANCE[payload.level],
              blocks: payload.blocks,
            }),
          }],
        },
      ],
      text: {
        verbosity: DEFAULT_VERBOSITY,
        format: {
          type: "json_schema",
          name: "plainly_adjusted_blocks",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                  },
                  required: ["id", "text"],
                },
              },
            },
            required: ["blocks"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) throw new Error("OpenAI returned no adjusted text");

  const parsed = JSON.parse(outputText);
  if (!Array.isArray(parsed.blocks)) throw new Error("OpenAI returned an invalid block response");

  const byId = new Map(parsed.blocks.map((block) => [block?.id, block?.text]));
  return payload.blocks.map((block) => {
    const text = byId.get(block.id);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error(`OpenAI omitted ${block.id}`);
    }
    return { id: block.id, text };
  });
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.length > 0) return data.output_text;

  return data?.output
    ?.filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
}

function validateApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim().length < 20) {
    throw new Error("Add a valid OpenAI API key in the Plainly extension first");
  }
}

function validatePayload(payload) {
  if (![1, 2, 3].includes(payload?.level)) throw new Error("level must be 1, 2, or 3");
  if (!Array.isArray(payload?.blocks) || payload.blocks.length === 0 || payload.blocks.length > 8) {
    throw new Error("blocks must contain between 1 and 8 items");
  }

  for (const block of payload.blocks) {
    if (typeof block?.id !== "string" || typeof block?.text !== "string" || block.text.trim().length === 0) {
      throw new Error("each block must contain a non-empty id and text");
    }
    if (block.text.length > 8_000) throw new Error("block text is too long");
  }
}
