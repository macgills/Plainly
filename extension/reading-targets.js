const oxfordLevels = ["1", "1+", ...Array.from({ length: 19 }, (_, i) => String(i + 2))];
const fpLevels = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const dibelsLevels = ["K", ...Array.from({ length: 8 }, (_, i) => String(i + 1))];

export const READING_SCHEMES = Object.freeze({
  oxford: { id: "oxford", name: "Oxford Reading Tree", levels: oxfordLevels, disclaimer: "Plainly targets Oxford language demands; it does not officially level a webpage." },
  fountasPinnell: { id: "fountasPinnell", name: "Fountas & Pinnell", levels: fpLevels, disclaimer: "Plainly targets F&P text characteristics; it does not assign an official F&P level." },
  dibels8: { id: "dibels8", name: "DIBELS 8th Edition", levels: dibelsLevels, disclaimer: "DIBELS is an assessment system, not a text-leveling scheme. Plainly uses the selected grade as a language-access target and does not convert or certify DIBELS scores." },
});

export const DEFAULT_READING_TARGET = Object.freeze({ scheme: "oxford", level: "8" });

export function isValidReadingTarget(scheme, level) {
  return Boolean(READING_SCHEMES[scheme]?.levels.includes(String(level)));
}

export function getReadingTarget(scheme, level) {
  if (!isValidReadingTarget(scheme, level)) throw new Error("Unsupported Plainly reading target");
  const value = String(level);
  const definition = READING_SCHEMES[scheme];
  return { scheme, schemeName: definition.name, level: value, label: formatReadingTargetLabel(scheme, value), disclaimer: definition.disclaimer, guidance: guidanceFor(scheme, value) };
}

export function formatReadingTargetLabel(scheme, level) {
  if (scheme === "oxford") return `Oxford ${level}`;
  if (scheme === "fountasPinnell") return `F&P ${level}`;
  if (scheme === "dibels8") return `DIBELS Grade ${level}`;
  return String(level);
}

function guidanceFor(scheme, level) {
  if (scheme === "dibels8") return dibelsGuidance(level);
  if (scheme === "oxford") return oxfordGuidance(level);
  return fpGuidance(level);
}

function oxfordGuidance(level) {
  const n = level === "1+" ? 1.5 : Number(level);
  if (n <= 2) return "Use extremely short direct sentences, very common concrete words, and explain essential subject words immediately.";
  if (n <= 5) return "Use short straightforward sentences, familiar vocabulary, explicit connections, and very short paragraphs.";
  if (n <= 8) return "Use mostly short-to-medium sentences, common vocabulary, clear paragraph structure, and explain important curriculum vocabulary in context.";
  if (n <= 12) return "Allow moderate sentence length and varied syntax while making relationships explicit and keeping non-fiction easy to scan.";
  if (n <= 16) return "Retain moderately challenging vocabulary and technical terms, simplifying genuinely dense syntax while preserving nuance.";
  return "Preserve sophisticated age-appropriate vocabulary, technical language, varied syntax, tone, uncertainty, and layered meaning; intervene mainly for clarity.";
}

function fpGuidance(level) {
  const i = level.charCodeAt(0) - 65;
  if (i <= 3) return "Use extremely predictable language, very short sentences, common concrete words, direct statements, and immediate explanations of essential vocabulary.";
  if (i <= 7) return "Use short clear sentences, familiar vocabulary, explicit sequencing, short paragraphs, and simple contextual explanations.";
  if (i <= 12) return "Use straightforward but increasingly varied sentences, preserve important content vocabulary, and make text structure explicit.";
  if (i <= 17) return "Allow varied sentence structures and moderately challenging vocabulary while reducing dense clauses and unnecessary abstraction.";
  if (i <= 21) return "Retain complex ideas, technical vocabulary, varied syntax, nuance, and normal informational text structure; clarify avoidable difficulty.";
  return "Preserve mature vocabulary, complex syntax, abstraction, technical terminology, tone, and nuance; make only minimal clarity adjustments.";
}

function dibelsGuidance(level) {
  if (level === "K") return "Target kindergarten language access: very short spoken-like sentences, highly familiar concrete vocabulary, explicit references, and immediate explanations of essential content words.";
  const grade = Number(level);
  if (grade <= 2) return "Target early-elementary language access: short direct sentences, high-frequency vocabulary, explicit sequencing, very short paragraphs, and simple explanations of essential subject words.";
  if (grade <= 4) return "Target developing-elementary language access: clear short-to-moderate sentences, transparent syntax, accessible academic vocabulary, and explicit relationships between ideas.";
  if (grade <= 6) return "Target upper-elementary to early-middle-school language access: allow moderate sentence complexity and academic vocabulary, but unpack dense clauses and implicit logical connections while preserving technical terms and nuance.";
  return "Target middle-school language access: retain age-appropriate academic and technical vocabulary, complex ideas, varied syntax, and nuance; simplify only avoidable processing barriers without reducing conceptual rigor.";
}
