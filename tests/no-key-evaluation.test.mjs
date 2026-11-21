import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCandidate } from "../evaluation/evaluate-no-key.mjs";

const cases = [{
  id: "sample",
  subject: "Science",
  source: "Scientists estimate about 20 centimetres in 2018.",
  requiredTerms: ["Scientists"],
  requiredAny: [["estimate", "estimated"], ["about", "around"]],
  teacherFocus: "Preserve uncertainty and numbers",
}];
const metadata = { provider: "offline-test-fixture", device: "test-only", target: "test" };

test("flags missing numbers, terms and uncertainty", () => {
  const report = evaluateCandidate(cases, {
    ...metadata,
    outputs: [{ id: "sample", text: "There was a change." }],
  });
  assert.equal(report.approvedForRelease, false);
  assert.equal(report.passedMechanicalChecks, false);
  assert.match(report.results[0].warnings.join("; "), /20/);
  assert.match(report.results[0].warnings.join("; "), /Scientists/);
});

test("even mechanically clean output is never auto-approved", () => {
  const report = evaluateCandidate(cases, {
    ...metadata,
    outputs: [{ id: "sample", text: "Scientists estimate that about 20 centimetres changed in 2018." }],
  });
  assert.equal(report.passedMechanicalChecks, true);
  assert.equal(report.approvedForRelease, false);
});

test("rejects duplicate and unexpected case IDs", () => {
  assert.throws(() => evaluateCandidate(cases, {
    ...metadata,
    outputs: [{ id: "sample", text: "a" }, { id: "sample", text: "b" }],
  }), /duplicate/);
  assert.throws(() => evaluateCandidate(cases, {
    ...metadata,
    outputs: [{ id: "unexpected", text: "a" }],
  }), /Unknown/);
});

test("unchanged text is not proof of simplification", () => {
  const report = evaluateCandidate(cases, {
    ...metadata,
    outputs: [{ id: "sample", text: cases[0].source }],
  });
  assert.match(report.results[0].warnings.join("; "), /Unchanged/);
});
