const enabled = document.querySelector("#enabled");
const apiKey = document.querySelector("#api-key");
const saveKey = document.querySelector("#save-key");
const removeKey = document.querySelector("#remove-key");
const keyStatus = document.querySelector("#key-status");

void initialise();

async function initialise() {
  const response = await send({ type: "PLAINLY_GET_SETTINGS" });
  if (!response?.ok) {
    setStatus(response?.error ?? "Could not read Plainly settings", true);
    return;
  }

  renderSettings(response.settings);

  enabled.addEventListener("change", async () => {
    await updateSettings({ enabled: enabled.checked });
  });

  for (const radio of document.querySelectorAll('input[name="level"]')) {
    radio.addEventListener("change", async () => {
      if (radio.checked) await updateSettings({ level: Number(radio.value) });
    });
  }

  saveKey.addEventListener("click", saveApiKey);
  apiKey.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void saveApiKey();
  });
  removeKey.addEventListener("click", removeApiKey);
}

async function updateSettings(settings) {
  const response = await send({ type: "PLAINLY_UPDATE_SETTINGS", settings });
  if (!response?.ok) setStatus(response?.error ?? "Could not save settings", true);
}

async function saveApiKey() {
  const value = apiKey.value.trim();
  saveKey.disabled = true;
  setStatus("Saving…");

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

async function removeApiKey() {
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
  const selected = document.querySelector(`input[name="level"][value="${settings.level}"]`);
  if (selected) selected.checked = true;
  renderKeyState(settings.hasApiKey);
  setStatus(settings.hasApiKey ? "API key saved." : "No API key saved.");
}

function renderKeyState(hasApiKey) {
  removeKey.hidden = !hasApiKey;
  apiKey.placeholder = hasApiKey ? "Replace saved key…" : "sk-…";
}

function setStatus(message, isError = false) {
  keyStatus.textContent = message;
  keyStatus.dataset.error = isError ? "true" : "false";
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}
