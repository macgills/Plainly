import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const numberToken = /\d+(?:[.,:/-]\d+)*(?:%)?/g;

export function evaluateCandidate(cases, candidate) {
  if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.outputs)) {
    throw new Error("Candidate must contain an outputs array");
  }
  if (!candidate.provider || !candidate.device || !candidate.target) {
    throw new Error("Candidate must document provider, device, and target");
  }
  const outputs = new Map();
  for (const output of candidate.outputs) {
    if (typeof output?.id !== "string" || typeof output?.text !== "string" || outputs.has(output.id)) {
      throw new Error("Candidate has invalid or duplicate output IDs");
    }
    outputs.set(output.id, output);
  }
  const results = cases.map((entry) => {
    const output = outputs.get(entry.id);
    const warnings = [];
    if (!output?.text?.trim()) warnings.push("Missing or empty rewrite");
    else {
      const text = output.text;
      const lower = text.toLocaleLowerCase();
      for (const term of entry.requiredTerms ?? []) {
        if (!lower.includes(term.toLocaleLowerCase())) warnings.push(`Missing required term: ${term}`);
      }
      for (const alternatives of entry.requiredAny ?? []) {
        if (!alternatives.some((term) => lower.includes(term.toLocaleLowerCase()))) {
          warnings.push(`Missing meaning/uncertainty marker: ${alternatives.join(" / ")}`);
        }
      }
      const sourceNumbers = new Set(entry.source.match(numberToken) ?? []);
      const rewrittenNumbers = new Set(text.match(numberToken) ?? []);
      for (const value of sourceNumbers) if (!rewrittenNumbers.has(value)) warnings.push(`Removed numeric fact: ${value}`);
      for (const value of rewrittenNumbers) if (!sourceNumbers.has(value)) warnings.push(`Added numeric fact: ${value}`);
      if (text.trim() === entry.source.trim()) warnings.push("Unchanged source: simplification not demonstrated");
    }
    return { id: entry.id, subject: entry.subject, source: entry.source, rewrite: output?.text ?? "", latencyMs: output?.latencyMs ?? null, warnings, teacherFocus: entry.teacherFocus };
  });
  for (const id of outputs.keys()) if (!cases.some((entry) => entry.id === id)) throw new Error(`Unknown candidate case: ${id}`);
  return {
    provider: candidate.provider,
    device: candidate.device,
    target: candidate.target,
    modelDownloadMb: candidate.modelDownloadMb ?? null,
    peakMemoryMb: candidate.peakMemoryMb ?? null,
    results,
    warningCount: results.reduce((sum, entry) => sum + entry.warnings.length, 0),
    passedMechanicalChecks: results.every((entry) => entry.warnings.length === 0),
    approvedForRelease: false,
    note: "Mechanical checks cannot establish factual fidelity, reading-level suitability, privacy, or usability. Expert review and real-device benchmarks are required. No API key is used by this evaluation script.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , candidatePath, reportPath] = process.argv;
  if (!candidatePath || !reportPath) {
    console.error("Usage: node evaluation/evaluate-no-key.mjs candidate.json report.json");
    process.exit(2);
  }
  const cases = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"));
  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  const report = evaluateCandidate(cases, candidate);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`${report.results.length} cases, ${report.warningCount} mechanical warnings. Release approval: NO (manual review required).`);
  if (!report.passedMechanicalChecks) process.exitCode = 1;
}
