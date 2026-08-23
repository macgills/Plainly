const enabled = document.querySelector("#enabled");
const apiKey = document.querySelector("#api-key");
const saveKey = document.querySelector("#save-key");
const removeKey = document.querySelector("#remove-key");
const keyStatus = document.querySelector("#key-status");
const scheme = document.querySelector("#scheme");
const level = document.querySelector("#level");
const dibelsFields = document.querySelector("#dibels-fields");
const dibelsPeriod = document.querySelector("#dibels-period");
const dibelsScore = document.querySelector("#dibels-score");
const dibelsRecommendation = document.querySelector("#dibels-recommendation");
const targetNote = document.querySelector("#target-note");
const kmp = globalThis["plainly-extension-core"]?.PlainlyCoreJs;
const OPENAI_PERMISSION = Object.freeze({ origins: ["https://api.openai.com/*"] });

if (!kmp) {
  setStatus("Plainly KMP core is unavailable.", true);
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

  saveKey.addEventListener("click", () => void saveApiKey());
  apiKey.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void saveApiKey();
  });
  removeKey.addEventListener("click", () => void removeApiKey());
}

async function loadSettings() {
  const response = await send({ type: "PLAINLY_GET_SETTINGS" });
  if (!response?.ok) {
    setStatus(response?.error ?? "Could not read Plainly settings", true);
    return;
  }
  renderSettings(response.settings);
}

async function updateSettings(settings) {
  const response = await send({ type: "PLAINLY_UPDATE_SETTINGS", settings });
  if (!response?.ok) setStatus(response?.error ?? "Could not save settings", true);
}

async function saveApiKey() {
  // Safari 18.4+ enforces its per-site permission model for cross-origin fetches from
  // extension pages. A declared host permission is necessary but not sufficient: the
  // extension must request the origin before fetch can use it. Start this directly from
  // the Save gesture so Safari can prompt when required. Chromium already reports the
  // required host permission as granted, so this remains a no-op there.
  const access = requestOpenAIAccess();
  await ready;
  const value = apiKey.value.trim();
  saveKey.disabled = true;
  setStatus("Saving…");

  if (!await access) {
    saveKey.disabled = false;
    setStatus("Allow Plainly to access api.openai.com so it can adjust text.", true);
    return;
  }

  const response = await send({ type: "PLAINLY_SAVE_API_KEY", apiKey: value });
  saveKey.disabled = false;

  if (!response?.ok) {
    setStatus(response?.error ?? "Could not save API key", true);
    return;
  }

  apiKey.value = "";
  renderKeyState(true);
  setStatus("API key saved on this device.");
}

async function requestOpenAIAccess() {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) return true;

  try {
    if (await chrome.permissions.contains(OPENAI_PERMISSION)) return true;
    return await chrome.permissions.request(OPENAI_PERMISSION);
  } catch (error) {
    console.warn("Plainly could not request OpenAI host access.", error);
    return false;
  }
}

async function removeApiKey() {
  await ready;
  const response = await send({ type: "PLAINLY_REMOVE_API_KEY" });
  if (!response?.ok) {
    setStatus(response?.error ?? "Could not remove API key", true);
    return;
  }

  apiKey.value = "";
  renderKeyState(false);
  setStatus("No API key saved.");
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
  renderKeyState(settings.hasApiKey);
  setStatus(settings.hasApiKey ? "API key saved." : "No API key saved.");
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

function renderKeyState(hasApiKey) {
  removeKey.hidden = !hasApiKey;
  apiKey.placeholder = hasApiKey ? "Replace saved key…" : "sk-…";
}

function setStatus(message, isError = false) {
  keyStatus.textContent = message;
  keyStatus.dataset.error = isError ? "true" : "false";
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
