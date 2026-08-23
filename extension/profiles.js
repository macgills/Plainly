export const READING_SCHEMES = Object.freeze({
  oxford: Object.freeze({
    id: "oxford",
    name: "Oxford Reading Tree",
    disclaimer: "Plainly targets the language demands associated with Oxford Levels; it does not certify or officially level a webpage.",
    levels: Object.freeze(["1", "1+", ...Array.from({ length: 19 }, (_, index) => String(index + 2))]),
  }),
  fountasPinnell: Object.freeze({
    id: "fountasPinnell",
    name: "Fountas & Pinnell",
    disclaimer: "Plainly targets text characteristics associated with the F&P A–Z gradient; it does not assign an official F&P level to a webpage or reader.",
    levels: Object.freeze(Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))),
  }),
});

export const DEFAULT_READING_TARGET = Object.freeze({ scheme: "oxford", level: "8" });

export function getReadingTarget(scheme, level) {
  const definition = READING_SCHEMES[scheme];
  if (!definition || !definition.levels.includes(String(level))) {
    throw new Error("Unsupported Plainly reading target");
  }

  const normalizedLevel = String(level);
  return Object.freeze({
    scheme,
    schemeName: definition.name,
    level: normalizedLevel,
    label: `${definition.name} · ${normalizedLevel}`,
    disclaimer: definition.disclaimer,
    guidance: buildGuidance(scheme, normalizedLevel),
  });
}

export function isValidReadingTarget(scheme, level) {
  const definition = READING_SCHEMES[scheme];
  return Boolean(definition && definition.levels.includes(String(level)));
}

function buildGuidance(scheme, level) {
  if (scheme === "oxford") return oxfordGuidance(level);
  return fountasPinnellGuidance(level);
}

function oxfordGuidance(level) {
  const n = level === "1+" ? 1.5 : Number(level);

  if (n <= 2) {
    return "Target a beginning reader: use extremely short, direct sentences, very common concrete words, repeated sentence patterns where natural, and explain any essential subject word immediately in plain language. Avoid relying on pictures to carry meaning because webpages may not provide supportive illustrations.";
  }
  if (n <= 5) {
    return "Target an early reader: use short straightforward sentences, familiar vocabulary, explicit connections between ideas, and simple explanations for essential subject words. Keep paragraphs very short and minimize subordinate clauses.";
  }
  if (n <= 8) {
    return "Target a developing independent reader: use mostly short-to-medium sentences, common vocabulary, clear paragraph structure, and retain important curriculum vocabulary with an immediate contextual explanation. Limit inference and unpack dense noun phrases.";
  }
  if (n <= 12) {
    return "Target a reader building fluency and stamina: allow moderate sentence length and some varied syntax, but make relationships between ideas explicit. Preserve useful subject terminology, explain less familiar words in context, and keep non-fiction information easy to scan.";
  }
  if (n <= 16) {
    return "Target a confident independent reader: retain moderately challenging vocabulary and technical terms, simplify only genuinely dense syntax, and preserve nuance. Paragraphs may contain several connected ideas, with clear signposting and limited unexplained abstraction.";
  }
  return "Target a fluent primary reader: preserve sophisticated age-appropriate vocabulary, technical language, varied sentence structures, tone, uncertainty, and layered meaning. Intervene mainly where syntax or specialist wording would create unnecessary barriers to comprehension.";
}

function fountasPinnellGuidance(level) {
  const index = level.charCodeAt(0) - 65;

  if (index <= 3) {
    return "Approximate the easiest end of the F&P A–Z text-difficulty gradient for webpage prose: use extremely predictable language, very short sentences, common concrete words, direct statements, and immediate explanations of essential subject vocabulary. Do not assume illustrations are available to support meaning.";
  }
  if (index <= 7) {
    return "Approximate an early F&P text-difficulty target: use short clear sentences, familiar vocabulary, explicit sequencing, short paragraphs, and simple contextual explanations for important unfamiliar words. Reduce inference and syntactic embedding.";
  }
  if (index <= 12) {
    return "Approximate a developing F&P text-difficulty target: use straightforward but increasingly varied sentences, preserve important content vocabulary with context, make text structure explicit, and keep conceptual relationships easy to follow.";
  }
  if (index <= 17) {
    return "Approximate an intermediate F&P text-difficulty target: allow varied sentence structures and moderately challenging vocabulary while reducing dense clauses and unnecessary abstraction. Preserve domain terminology, text structure, nuance, and important conceptual relationships.";
  }
  if (index <= 21) {
    return "Approximate an advanced F&P text-difficulty target: retain complex ideas, technical vocabulary, varied syntax, figurative or nuanced language where it matters, and normal informational text structure. Clarify only language that creates avoidable processing difficulty.";
  }
  return "Approximate the most demanding end of the F&P A–Z gradient: preserve mature vocabulary, complex syntax, subtle relationships, abstraction, technical terminology, tone, and nuance. Make only minimal adjustments required for clarity and do not flatten the intellectual content.";
}
