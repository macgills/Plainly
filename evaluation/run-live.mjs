import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL, simplifyWithOpenAI } from "../extension/openai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "../evaluation-artifacts");
const cases = JSON.parse(await readFile(path.join(here, "cases.json"), "utf8"));
const apiKey = process.env.AI_SECRET;
const levels = [1, 2, 3];
const numberToken = /\d+(?:[.,:/-]\d+)*(?:%)?/g;

if (!apiKey) throw new Error("AI_SECRET is required to build the teacher evaluation pack");
await mkdir(outputDir, { recursive: true });

const results = cases.map((entry) => ({
  ...entry,
  outputs: {},
}));
const requestLatenciesMs = {};

for (const level of levels) {
  const startedAt = Date.now();
  const adjusted = await simplifyWithOpenAI({
    apiKey,
    payload: {
      title: "Plainly teacher evaluation corpus",
      level,
      blocks: cases.map((entry) => ({ id: entry.id, text: entry.source })),
    },
  });
  requestLatenciesMs[level] = Date.now() - startedAt;

  const byId = new Map(adjusted.map((block) => [block.id, block.text]));
  for (const result of results) {
    const text = byId.get(result.id);
    if (!text) throw new Error(`OpenAI omitted evaluation case ${result.id} at level ${level}`);
    result.outputs[level] = {
      text,
      warnings: hardWarnings(result, text),
    };
  }
}

const warningCount = results.reduce(
  (total, result) => total + levels.reduce((sum, level) => sum + result.outputs[level].warnings.length, 0),
  0,
);
const artifact = {
  generatedAt: new Date().toISOString(),
  model: DEFAULT_MODEL,
  levels,
  requestLatenciesMs,
  warningCount,
  note: "Warnings are mechanical checks only. A teacher must judge meaning preservation and reading-level suitability.",
  cases: results,
};

await writeFile(
  path.join(outputDir, "plainly-teacher-review.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(outputDir, "plainly-teacher-review.html"),
  buildHtml(artifact),
  "utf8",
);
await writeFile(
  path.join(outputDir, "README.txt"),
  [
    "Plainly teacher review pack",
    "",
    "Open plainly-teacher-review.html in a browser.",
    "For every source passage, review Levels 1, 2 and 3 for:",
    "  1. Is every important fact still true?",
    "  2. Is the language genuinely easier at the selected level?",
    "  3. Were important subject terms preserved or explained appropriately?",
    "  4. Would you be comfortable giving this version to a student?",
    "",
    `Mechanical warnings in this run: ${warningCount}`,
    "These warnings only detect obvious changed terms/numbers/uncertainty markers and are not a quality score.",
    "No API key or request headers are included.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Teacher evaluation pack generated: ${results.length} passages × ${levels.length} levels, ${warningCount} mechanical warnings.`);

function hardWarnings(entry, adjusted) {
  const warnings = [];
  const lower = adjusted.toLocaleLowerCase();

  for (const term of entry.requiredTerms ?? []) {
    if (!lower.includes(term.toLocaleLowerCase())) {
      warnings.push(`Required term missing: ${term}`);
    }
  }

  for (const alternatives of entry.requiredAny ?? []) {
    if (!alternatives.some((term) => lower.includes(term.toLocaleLowerCase()))) {
      warnings.push(`Uncertainty/meaning marker missing; expected one of: ${alternatives.join(", ")}`);
    }
  }

  const sourceNumbers = new Set(entry.source.match(numberToken) ?? []);
  const adjustedNumbers = new Set(adjusted.match(numberToken) ?? []);
  for (const number of sourceNumbers) {
    if (!adjustedNumbers.has(number)) warnings.push(`Numeric fact removed: ${number}`);
  }
  for (const number of adjustedNumbers) {
    if (!sourceNumbers.has(number)) warnings.push(`Numeric fact added: ${number}`);
  }

  return [...new Set(warnings)];
}

function buildHtml(artifact) {
  const rows = artifact.cases.map((entry) => {
    const outputCards = artifact.levels.map((level) => {
      const output = entry.outputs[level];
      const warningMarkup = output.warnings.length === 0
        ? '<div class="checks good">Mechanical checks: clear</div>'
        : `<div class="checks warn"><strong>Review warning</strong><ul>${output.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>`;
      return `
        <article class="card adjusted">
          <div class="eyebrow">Plainly · Level ${level}</div>
          <p>${escapeHtml(output.text)}</p>
          ${warningMarkup}
          <div class="teacher-checks">
            <span>□ Meaning preserved</span>
            <span>□ Level appropriate</span>
            <span>□ Terms handled well</span>
            <span>□ Student-ready</span>
          </div>
        </article>`;
    }).join("");

    return `
      <section class="case">
        <div class="case-heading">
          <div><span class="subject">${escapeHtml(entry.subject)}</span><h2>${escapeHtml(entry.id)}</h2></div>
          <p>${escapeHtml(entry.teacherFocus)}</p>
        </div>
        <article class="card source">
          <div class="eyebrow">Source</div>
          <p>${escapeHtml(entry.source)}</p>
        </article>
        <div class="outputs">${outputCards}</div>
      </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plainly teacher review pack</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #181a1d; font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { width: min(1380px, calc(100% - 48px)); margin: auto; padding: 52px 0 72px; }
  header { margin-bottom: 38px; }
  .brand { font-weight: 850; letter-spacing: .08em; text-transform: uppercase; font-size: 14px; }
  h1 { margin: 7px 0 8px; font-size: 42px; line-height: 1.08; }
  .meta, .case-heading p { color: #5d626a; }
  .summary { display: inline-block; margin-top: 14px; padding: 8px 12px; border-radius: 999px; background: white; border: 1px solid #d8dbe0; }
  .case { margin: 38px 0 58px; padding-top: 28px; border-top: 1px solid #d4d7dc; }
  .case-heading { display: flex; gap: 30px; justify-content: space-between; align-items: end; margin-bottom: 16px; }
  .case-heading h2 { margin: 3px 0 0; font-size: 25px; }
  .case-heading p { max-width: 700px; margin: 0; }
  .subject, .eyebrow { color: #62676f; font-size: 12px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  .card { padding: 22px 24px; border: 1px solid #d8dbe0; border-radius: 12px; background: white; }
  .source { margin-bottom: 14px; background: #fbfbfc; }
  .card p { margin: 12px 0 0; }
  .outputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .adjusted { min-height: 260px; }
  .checks { margin-top: 18px; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
  .good { background: #f2f7f3; }
  .warn { background: #fff6e7; }
  .checks ul { margin: 6px 0 0; padding-left: 20px; }
  .teacher-checks { display: grid; gap: 4px; margin-top: 18px; color: #4d5157; font-size: 13px; }
  @media (max-width: 900px) { .outputs { grid-template-columns: 1fr; } .case-heading { display: block; } }
  @media print { body { background: white; } main { width: 100%; padding: 0; } .case { break-inside: avoid; } }
</style>
</head>
<body>
<main>
<header>
  <div class="brand">Plainly</div>
  <h1>Teacher review pack</h1>
  <div class="meta">${escapeHtml(artifact.model)} · ${artifact.cases.length} passages · Levels ${artifact.levels.join(", ")} · generated ${escapeHtml(artifact.generatedAt)}</div>
  <div class="summary">${artifact.warningCount} mechanical warning${artifact.warningCount === 1 ? "" : "s"} · teacher judgement is the real evaluation</div>
</header>
${rows}
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
