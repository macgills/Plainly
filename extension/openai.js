import { getReadingTarget } from "./reading-targets.js";

export const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_MODEL = "gpt-5-mini";

export async function simplifyWithOpenAI({ apiKey, payload, apiUrl = DEFAULT_OPENAI_API_URL, model = DEFAULT_MODEL, fetchImpl = fetch }) {
  validateApiKey(apiKey);
  validatePayload(payload);
  const target = getReadingTarget(payload.scheme, payload.level);

  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: [{ type: "input_text", text: [
          "You adjust informational web prose for a specified reading target.",
          "Use only information present in the supplied source text.",
          "Do not add facts, examples, explanations, causes, or conclusions from your own knowledge.",
          "Preserve names, dates, numbers, uncertainty, comparisons, negation, and the meaning of technical terms.",
          "Reduce linguistic barriers without reducing the intellectual content required by the source.",
          "The named reading scheme is a transformation target, not an official assessment or certification of the webpage or reader.",
          "Return one adjusted string for every supplied block id.",
        ].join(" ") }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify({
          title: payload.title ?? "",
          readingTarget: { scheme: target.schemeName, level: target.level, guidance: target.guidance, qualification: target.disclaimer },
          blocks: payload.blocks,
        }) }] },
      ],
      text: { format: { type: "json_schema", name: "plainly_adjusted_blocks", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: { blocks: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } } },
        required: ["blocks"],
      } } },
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
    if (typeof text !== "string" || text.trim().length === 0) throw new Error(`OpenAI omitted ${block.id}`);
    return { id: block.id, text };
  });
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.length > 0) return data.output_text;
  return data?.output?.filter((item) => item.type === "message").flatMap((item) => item.content ?? []).find((content) => content.type === "output_text")?.text;
}

function validateApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim().length < 20) throw new Error("Add a valid OpenAI API key in the Plainly extension first");
}

function validatePayload(payload) {
  getReadingTarget(payload?.scheme, payload?.level);
  if (!Array.isArray(payload?.blocks) || payload.blocks.length === 0 || payload.blocks.length > 8) throw new Error("blocks must contain between 1 and 8 items");
  for (const block of payload.blocks) {
    if (typeof block?.id !== "string" || typeof block?.text !== "string" || block.text.trim().length === 0) throw new Error("each block must contain a non-empty id and text");
    if (block.text.length > 8_000) throw new Error("block text is too long");
  }
}
