// Experimental, local-only Chrome built-in Prompt API adapter.
// No network requests or user API keys. Availability depends on Chrome and hardware.
export async function simplifyWithBrowserAI({ payload }) {
  const model = globalThis.LanguageModel;
  if (!model?.create || !model?.availability) {
    throw new Error("This Chrome version does not offer the built-in language model. Plainly cannot adjust this page on this device yet.");
  }
  const availability = await model.availability();
  if (availability !== "available") {
    throw new Error(`Chrome's built-in language model is ${availability}. Plainly cannot adjust this page yet.`);
  }
  const session = await model.create();
  try {
    const output = [];
    for (const block of payload.blocks) {
      const instruction = [
        "Rewrite this webpage paragraph for the reading target below.",
        "Keep all facts, names, numbers, uncertainty, and important subject terms accurate.",
        "Do not add claims or explanations not supported by the source.",
        "Return only the rewritten paragraph, with no preface or markdown.",
        `Reading target: ${JSON.stringify(payload.readingTarget)}`,
        `Source paragraph: ${block.text}`,
      ].join("\n");
      const text = (await session.prompt(instruction)).trim();
      if (!text) throw new Error("The built-in model returned an empty rewrite.");
      output.push({ id: block.id, text });
    }
    return output;
  } finally {
    session.destroy?.();
  }
}
