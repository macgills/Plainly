import { simplifyWithOpenAI } from "./openai.js";

// All rewriting engines use the same contract:
// simplify({ apiKey, payload }) -> [{ id, text }, ...].
// Keep provider selection in the trusted background context, never in page scripts.
export const DEFAULT_REWRITING_PROVIDER = "openai";

const providers = Object.freeze({
  openai: simplifyWithOpenAI,
});

export function availableRewritingProviders() {
  return Object.keys(providers);
}

export async function simplifyWithProvider({
  provider = DEFAULT_REWRITING_PROVIDER,
  apiKey,
  payload,
  adapters = providers,
}) {
  const simplify = Object.hasOwn(adapters, provider) ? adapters[provider] : undefined;
  if (typeof simplify !== "function") {
    throw new Error(`Unsupported Plainly rewriting provider: ${provider}`);
  }
  const result = await simplify({ apiKey, payload });
  if (!Array.isArray(result) || result.length !== payload?.blocks?.length) {
    throw new Error("Rewriting provider returned an invalid block count");
  }
  const byId = new Map();
  for (const block of result) {
    if (typeof block?.id !== "string" || typeof block?.text !== "string" ||
        !block.text.trim() || byId.has(block.id)) {
      throw new Error("Rewriting provider returned an invalid block");
    }
    byId.set(block.id, block.text);
  }
  return payload.blocks.map(({ id }) => {
    if (!byId.has(id)) throw new Error(`Rewriting provider omitted ${id}`);
    return { id, text: byId.get(id) };
  });
}
