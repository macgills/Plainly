const oxfordLevels = ["1", "1+", ...Array.from({ length: 19 }, (_, i) => String(i + 2))];
const fpLevels = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const dibelsMazeGrades = Array.from({ length: 7 }, (_, i) => String(i + 2));

export const READING_SCHEMES = Object.freeze({
  oxford: { id: "oxford", name: "Oxford Reading Tree", levels: oxfordLevels, disclaimer: "Plainly targets Oxford language demands; it does not officially level a webpage." },
  fountasPinnell: { id: "fountasPinnell", name: "Fountas & Pinnell", levels: fpLevels, disclaimer: "Plainly targets F&P text characteristics; it does not assign an official F&P level." },
  dibelsMaze: { id: "dibelsMaze", name: "DIBELS 8 — Maze", levels: dibelsMazeGrades, periods: ["beginning", "middle", "end"], disclaimer: "DIBELS Maze is a comprehension assessment, not a text-leveling scheme. Plainly uses grade, benchmark period and Maze score to recommend a language-access target; cross-scheme ranges are approximate rather than official conversions." },
});

export const DEFAULT_READING_TARGET = Object.freeze({ scheme: "oxford", level: "8" });

const DIBELS_MAZE_BENCHMARKS = Object.freeze({
  "2": { beginning: [11, 5, 2.5], middle: [14.5, 9, 6.5], end: [18, 9.5, 7] },
  "3": { beginning: [15, 8, 5], middle: [20.5, 12, 9.5], end: [22.5, 15.5, 12] },
  "4": { beginning: [21, 14.5, 11], middle: [23.5, 16.5, 13], end: [28, 17, 14] },
  "5": { beginning: [20, 13.5, 10.5], middle: [27, 17, 14.5], end: [29.5, 21, 18] },
  "6": { beginning: [23, 14.5, 12.5], middle: [30.5, 19.5, 15], end: [33.5, 26.5, 20.5] },
  "7": { beginning: [25.5, 20, 15.5], middle: [33, 24.5, 18], end: [38.5, 29.5, 24.5] },
  "8": { beginning: [24.5, 20, 16.5], middle: [32, 26, 19.5], end: [38, 28, 24.5] },
});

const ACCESS_CROSSWALK = Object.freeze({
  "2": { lexile: "420–650L", fountasPinnell: "J–M", oxford: "7–9" },
  "3": { lexile: "520–820L", fountasPinnell: "L–P", oxford: "8–11" },
  "4": { lexile: "640–940L", fountasPinnell: "N–S", oxford: "10–13" },
  "5": { lexile: "730–1010L", fountasPinnell: "Q–T", oxford: "12–14" },
  "6": { lexile: "800–1080L", fountasPinnell: "S–V", oxford: "13–16" },
  "7": { lexile: "850–1140L", fountasPinnell: "U–W", oxford: "15–17" },
  "8": { lexile: "900–1200L", fountasPinnell: "V–Z", oxford: "16–20" },
});

export function isValidReadingTarget(scheme, level) {
  return Boolean(READING_SCHEMES[scheme]?.levels.includes(String(level)));
}

export function getReadingTarget(scheme, level, assessment = null) {
  if (!isValidReadingTarget(scheme, level)) throw new Error("Unsupported Plainly reading target");
  if (scheme === "dibelsMaze") return dibelsMazeTarget(String(level), assessment);
  const value = String(level);
  const definition = READING_SCHEMES[scheme];
  return { scheme, schemeName: definition.name, level: value, label: formatReadingTargetLabel(scheme, value), disclaimer: definition.disclaimer, guidance: guidanceFor(scheme, value) };
}

export function formatReadingTargetLabel(scheme, level) {
  if (scheme === "oxford") return `Oxford ${level}`;
  if (scheme === "fountasPinnell") return `F&P ${level}`;
  if (scheme === "dibelsMaze") return `DIBELS Maze · Grade ${level}`;
  return String(level);
}

export function classifyDibelsMaze(grade, period, score) {
  const thresholds = DIBELS_MAZE_BENCHMARKS[String(grade)]?.[period];
  const numericScore = Number(score);
  if (!thresholds || !Number.isFinite(numericScore) || numericScore < 0) throw new Error("Invalid DIBELS Maze assessment");
  if (numericScore >= thresholds[0]) return "blue";
  if (numericScore >= thresholds[1]) return "green";
  if (numericScore >= thresholds[2]) return "yellow";
  return "red";
}

export function recommendFromDibelsMaze(grade, period, score) {
  const assessedGrade = String(grade);
  const band = classifyDibelsMaze(assessedGrade, period, score);
  const shift = { blue: 0, green: 0, yellow: -1, red: -2 }[band];
  const accessGrade = String(Math.max(2, Math.min(8, Number(assessedGrade) + shift)));
  return {
    band,
    support: { blue: "Core support · negligible risk", green: "Core support · minimal risk", yellow: "Strategic support · some risk", red: "Intensive support · at risk" }[band],
    assessedGrade,
    accessGrade,
    crosswalk: ACCESS_CROSSWALK[accessGrade],
  };
}

function guidanceFor(scheme, level) {
  if (scheme === "oxford") return oxfordGuidance(level);
  return fpGuidance(level);
}

function dibelsMazeTarget(grade, assessment) {
  const definition = READING_SCHEMES.dibelsMaze;
  if (!assessment?.period || assessment?.score == null || assessment.score === "") {
    return { scheme: "dibelsMaze", schemeName: definition.name, level: grade, label: formatReadingTargetLabel("dibelsMaze", grade), disclaimer: definition.disclaimer, guidance: dibelsGradeGuidance(grade) };
  }
  const recommendation = recommendFromDibelsMaze(grade, assessment.period, assessment.score);
  return {
    scheme: "dibelsMaze",
    schemeName: definition.name,
    level: grade,
    label: formatReadingTargetLabel("dibelsMaze", grade),
    disclaimer: definition.disclaimer,
    guidance: `${dibelsGradeGuidance(recommendation.accessGrade)} The Grade ${grade} ${assessment.period}-of-year Maze score of ${Number(assessment.score)} falls in the official DIBELS ${recommendation.support} band. Plainly is using an approximate Grade ${recommendation.accessGrade} language-access target while preserving factual content.`,
    recommendation,
  };
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

function dibelsGradeGuidance(level) {
  const grade = Number(level);
  if (grade <= 2) return "Target comprehension-accessible Grade 2 web prose: use short direct sentences, highly familiar words, explicit sequencing, very short paragraphs, and simple explanations of essential subject words.";
  if (grade <= 4) return "Target comprehension-accessible upper-elementary prose: use clear sentence structure, accessible academic vocabulary, explicit relationships between ideas, and short-to-medium paragraphs.";
  if (grade <= 6) return "Target comprehension-accessible middle-grade prose: allow varied syntax and academic vocabulary while unpacking dense clauses and implicit logical connections, preserving technical terms and nuance.";
  return "Target comprehension-accessible Grade 7–8 prose: retain complex ideas, academic and technical vocabulary, varied syntax, and nuance; simplify only avoidable processing barriers without reducing conceptual rigor.";
}
