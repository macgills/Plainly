import { READING_SCHEMES } from "./profiles.js";

const enabled = document.querySelector("#enabled");
const apiKey = document.querySelector("#api-key");
const saveKey = document.querySelector("#save-key");
const removeKey = document.querySelector("#remove-key");
const keyStatus = document.querySelector("#key-status");
const scheme = document.querySelector("#scheme");
const level = document.querySelector("#level");
const schemeNote = document.querySelector("#scheme-note");

bindEvents();
const ready = loadSettings();

function bindEvents() {
  enabled.addEventListener("change", async () => { await ready; await updateSettings({ enabled: enabled.checked }); });
  scheme.addEventListener("change", async () => {
    await ready;
    populateLevels(scheme.value);
    await updateSettings({ scheme: scheme.value, level: level.value });
  });
  level.addEventListener("change", async () => { await ready; await updateSettings({ scheme: scheme.value, level: level.value }); });
  saveKey.addEventListener("click", () => void saveApiKey());
  apiKey.addEventListener("keydown", (event) => { if (event.key === "Enter") void saveApiKey(); });
  removeKey.addEventListener("click", () => void removeApiKey());
}

async function loadSettings() {
  const response = await send({ type: "PLAINLY_GET_SETTINGS" });
  if (!response?.ok) { setStatus(response?.error ?? "Could not read Plainly settings", true); return; }
  renderSettings(response.settings);
}

async function updateSettings(settings) {
  const response = await send({ type: "PLAINLY_UPDATE_SETTINGS", settings });
  if (!response?.ok) setStatus(response?.error ?? "Could not save settings", true);
}

async function saveApiKey() {
  await ready;
  const value = apiKey.value.trim();
  saveKey.disabled = true;
  setStatus("Saving…");
  const response = await send({ type: "PLAINLY_SAVE_API_KEY", apiKey: value });
  saveKey.disabled = false;
  if (!response?.ok) { setStatus(response?.error ?? "Could not save API key", true); return; }
  apiKey.value = "";
  renderKeyState(true);
  setStatus("API key saved on this device.");
}

async function removeApiKey() {
  await ready;
  const response = await send({ type: "PLAINLY_REMOVE_API_KEY" });
  if (!response?.ok) { setStatus(response?.error ?? "Could not remove API key", true); return; }
  apiKey.value = "";
  renderKeyState(false);
  setStatus("No API key saved.");
}

function renderSettings(settings) {
  enabled.checked = settings.enabled;
  scheme.value = settings.scheme;
  populateLevels(settings.scheme, settings.level);
  renderKeyState(settings.hasApiKey);
  setStatus(settings.hasApiKey ? "API key saved." : "No API key saved.");
}

function populateLevels(schemeId, selectedLevel) {
  const definition = READING_SCHEMES[schemeId];
  level.replaceChildren(...definition.levels.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = schemeId === "oxford" ? `Oxford Level ${value}` : `F&P Level ${value}`;
    option.selected = value === selectedLevel;
    return option;
  }));
  schemeNote.textContent = definition.disclaimer;
}

function renderKeyState(hasApiKey) { removeKey.hidden = !hasApiKey; apiKey.placeholder = hasApiKey ? "Replace saved key…" : "sk-…"; }
function setStatus(message, isError = false) { keyStatus.textContent = message; keyStatus.dataset.error = isError ? "true" : "false"; }
function send(message) { return chrome.runtime.sendMessage(message); }
