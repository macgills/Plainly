await import("../extension/generated/plainly-core.js");

const kmp = globalThis["plainly-extension-core"]?.PlainlyCoreJs;
if (!kmp) throw new Error("Plainly KMP browser bundle is unavailable");

export function resolvePromptTarget({
  scheme,
  level,
  dibelsPeriod = "",
  dibelsMazeScore = "",
}) {
  const target = kmp.resolveReadingTarget(scheme, level, dibelsPeriod, dibelsMazeScore);
  const recommendation = target.recommendation;
  return {
    label: target.label,
    prompt: {
      schemeId: target.schemeId,
      scheme: target.schemeName,
      level: target.level,
      guidance: target.guidance,
      qualification: target.disclaimer,
      recommendation: recommendation ? {
        band: recommendation.band,
        benchmarkLabel: recommendation.benchmarkLabel,
        support: recommendation.support,
        assessedGrade: recommendation.assessedGrade,
        accessGrade: recommendation.accessGrade,
        approximateCrosswalk: {
          lexile: recommendation.lexile,
          fountasPinnell: recommendation.fountasPinnell,
          oxford: recommendation.oxford,
        },
      } : null,
    },
  };
}
