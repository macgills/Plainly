const enabled = document.querySelector("#enabled");
const scheme = document.querySelector("#scheme");
const level = document.querySelector("#level");
const dibelsFields = document.querySelector("#dibels-fields");
const dibelsPeriod = document.querySelector("#dibels-period");
const dibelsScore = document.querySelector("#dibels-score");
const dibelsRecommendation = document.querySelector("#dibels-recommendation");
const targetNote = document.querySelector("#target-note");
const kmp = globalThis["plainly-extension-core"]?.PlainlyCoreJs;

if (!kmp) {
  console.error("Plainly KMP core is unavailable.");
  throw new Error("Plainly KMP core is unavailable");
}

const definitions = new Map([...kmp.readingSchemes()].map((definition) => [definition.id, definition]));
const defaultTarget = kmp.defaultReadingTarget();

populateSchemes();
populateDibelsPeriods();
bindEvents();
const ready = loadSettings();

function populateSchemes() {
  scheme.replaceChildren(...[...definitions.values()].map((definition) => option(definition.id, definition.name)));
}

function populateDibelsPeriods() {
  dibelsPeriod.replaceChildren(...[...kmp.dibelsPeriods()].map((period) => option(period.id, period.name)));
}

function populateLevels(definition, selectedLevel) {
  level.replaceChildren(...[...definition.levels].map((value) => option(value, formatLevel(definition.id, value))));
  level.value = [...definition.levels].includes(selectedLevel) ? selectedLevel : definition.levels[0];
}

function bindEvents() {
  enabled.addEventListener("change", () => {
    void ready.then(() => updateSettings({ enabled: enabled.checked }));
  });

  scheme.addEventListener("change", () => {
    const definition = definitions.get(scheme.value);
    populateLevels(definition, "");
    renderTargetDetails();
    void ready.then(() => updateSettings({ scheme: scheme.value, level: level.value }));
  });

  level.addEventListener("change", () => {
    renderTargetDetails();
    void ready.then(() => updateSettings({ level: level.value }));
  });

  dibelsPeriod.addEventListener("change", () => {
    renderTargetDetails();
    void ready.then(() => updateSettings({ dibelsPeriod: dibelsPeriod.value }));
  });

  dibelsScore.addEventListener("change", () => {
    const score = dibelsScore.value.trim();
    renderTargetDetails();
    void ready.then(() => updateSettings({ dibelsMazeScore: score }));
  });

}

async function loadSettings() {
  const response = await send({ type: "PLAINLY_GET_SETTINGS" });
  if (!response?.ok) {
    console.error(response?.error ?? "Could not read Plainly settings");
    return;
  }
  renderSettings(response.settings);
}

async function updateSettings(settings) {
  const response = await send({ type: "PLAINLY_UPDATE_SETTINGS", settings });
  if (!response?.ok) console.error(response?.error ?? "Could not save settings");
}

function renderSettings(settings) {
  enabled.checked = settings.enabled;
  const definition = definitions.get(settings.scheme) ?? definitions.get(defaultTarget.schemeId);
  scheme.value = definition.id;
  populateLevels(definition, settings.scheme === definition.id ? String(settings.level) : defaultTarget.level);
  dibelsPeriod.value = [...kmp.dibelsPeriods()].some((period) => period.id === settings.dibelsPeriod)
    ? settings.dibelsPeriod
    : "middle";
  dibelsScore.value = settings.dibelsMazeScore ?? "";
  renderTargetDetails();
}

function renderTargetDetails() {
  const isDibels = scheme.value === "dibelsMaze";
  dibelsFields.hidden = !isDibels;
  const definition = definitions.get(scheme.value);
  targetNote.textContent = definition?.disclaimer ?? "";
  dibelsRecommendation.hidden = true;
  dibelsRecommendation.textContent = "";

  if (!isDibels || dibelsScore.value.trim() === "") return;

  try {
    const target = kmp.resolveReadingTarget(scheme.value, level.value, dibelsPeriod.value, dibelsScore.value.trim());
    const recommendation = target.recommendation;
    if (!recommendation) return;
    dibelsRecommendation.textContent = [
      `${recommendation.benchmarkLabel} · ${recommendation.support}.`,
      `Plainly access target: approximately Grade ${recommendation.accessGrade}.`,
      `Approximate crosswalk: ${recommendation.lexile} · F&P ${recommendation.fountasPinnell} · Oxford ${recommendation.oxford}.`,
    ].join(" ");
    dibelsRecommendation.hidden = false;
  } catch (error) {
    dibelsRecommendation.textContent = error instanceof Error ? error.message : String(error);
    dibelsRecommendation.hidden = false;
  }
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function formatLevel(schemeId, value) {
  return schemeId === "dibelsMaze" ? `Grade ${value}` : value;
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}
