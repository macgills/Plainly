import assert from "node:assert/strict";
import test from "node:test";
import { classifyDibelsMaze, recommendFromDibelsMaze, READING_SCHEMES } from "../extension/reading-targets.js";

test("DIBELS Maze supports grades 2 through 8", () => {
  assert.deepEqual(READING_SCHEMES.dibelsMaze.levels, ["2", "3", "4", "5", "6", "7", "8"]);
});

test("Grade 4 middle-year Maze scores use DIBELS benchmark boundaries", () => {
  assert.equal(classifyDibelsMaze("4", "middle", 24), "blue");
  assert.equal(classifyDibelsMaze("4", "middle", 18), "green");
  assert.equal(classifyDibelsMaze("4", "middle", 14), "yellow");
  assert.equal(classifyDibelsMaze("4", "middle", 10), "red");
});

test("Maze recommendation includes a Plainly crosswalk", () => {
  const result = recommendFromDibelsMaze("4", "middle", 14);
  assert.equal(result.band, "yellow");
  assert.equal(result.accessGrade, "3");
  assert.ok(result.crosswalk.lexile);
  assert.ok(result.crosswalk.fountasPinnell);
  assert.ok(result.crosswalk.oxford);
});
