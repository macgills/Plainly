import { createHash } from "node:crypto";
import { createServer } from "node:http";

const LEVEL_GUIDANCE = Object.freeze({
  1: "Use very common words, short sentences, one main idea per sentence, and explain essential subject words in simple language.",
  2: "Use common vocabulary and mostly short sentences. Keep essential subject vocabulary, but explain unfamiliar terms in context.",
  3: "Use clear secondary-school language. Reduce sentence complexity while preserving important domain terminology and nuance.",
});

export function createPlainlyServer({ simplify = createOpenAISimplifier(), logger = console } = {}) {
  const cache = new Map();

  return createServer(async (request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") return sendJson(response, 204, null);
    if (request.method === "GET" && request.url === "/health") return sendJson(response, 200, { ok: true });
    if (request.method !== "POST" || request.url !== "/simplify") return sendJson(response, 404, { error: "Not found" });

    try {
      const body = await readJson(request);
      validateRequest(body);

      const result = [];
      const misses = [];
      for (const block of body.blocks) {
        const key = cacheKey(body.level, block.text);
        const cached = cache.get(key);
        if (cached) result.push({ id: block.id, text: cached });
        else misses.push({ ...block, key });
      }

      if (misses.length > 0) {
        const adjusted = await simplify({
          level: body.level,
          guidance: LEVEL_GUIDANCE[body.level],
          title: body.title ?? "",
          blocks: misses.map(({ id, text }) => ({ id, text })),
        });
        const adjustedById = new Map(adjusted.map((block) => [block.id, block.text]));
        for (const miss of misses) {
          const text = adjustedById.get(miss.id);
          if (!text) throw new Error(`Simplifier omitted ${miss.id}`);
          cache.set(miss.key, text);
          result.push({ id: miss.id, text });
        }
      }

      const order = new Map(body.blocks.map((block, index) => [block.id, index]));
      result.sort((a, b) => order.get(a.id) - order.get(b.id));
      return sendJson(response, 200, { blocks: result });
    } catch (error) {
      logger.error?.(error);
      const status = error instanceof RequestError ? 400 : 500;
      return sendJson(response, status, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
}

export function createOpenAISimplifier({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.PLAINLY_MODEL ?? "gpt-5-mini",
  fetchImpl = fetch,
} = {}) {
  return async ({ level, guidance, title, blocks }) => {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");

    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: [
                "You adjust Wikipedia prose to a specified reading level.",
                "Use only information present in the supplied source text.",
                "Do not add facts, examples, explanations, causes, or conclusions from your own knowledge.",
                "Preserve names, dates, numbers, uncertainty, comparisons, negation, and the meaning of technical terms.",
                "Simplify syntax and vocabulary without removing information needed to understand the source.",
                "Return one adjusted string for every supplied block id.",
              ].join(" "),
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify({ title, level, guidance, blocks }) }],
          },
        ],
        text: {
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
                    properties: { id: { type: "string" }, text: { type: "string" } },
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
      throw new Error(`OpenAI returned ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const outputText = data.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text;

    if (!outputText) throw new Error("OpenAI returned no adjusted text");
    const parsed = JSON.parse(outputText);
    if (!Array.isArray(parsed.blocks)) throw new Error("OpenAI returned an invalid block response");
    return parsed.blocks;
  };
}

class RequestError extends Error {}

function validateRequest(body) {
  if (![1, 2, 3].includes(body?.level)) throw new RequestError("level must be 1, 2, or 3");
  if (!Array.isArray(body?.blocks) || body.blocks.length === 0 || body.blocks.length > 8) {
    throw new RequestError("blocks must contain between 1 and 8 items");
  }
  for (const block of body.blocks) {
    if (typeof block?.id !== "string" || typeof block?.text !== "string" || block.text.trim().length === 0) {
      throw new RequestError("each block must contain a non-empty id and text");
    }
    if (block.text.length > 8_000) throw new RequestError("block text is too long");
  }
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 128_000) throw new RequestError("request body is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("request body must be valid JSON");
  }
}

function cacheKey(level, text) {
  return createHash("sha256").update(`v1:${level}:${text}`).digest("hex");
}

function setCors(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response, status, body) {
  response.statusCode = status;
  if (body === null) return response.end();
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
