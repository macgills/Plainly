const DEFAULT_SETTINGS = { enabled: true, level: 2 };

void initialise();

async function initialise() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const enabled = document.querySelector("#enabled");
  enabled.checked = settings.enabled;

  const selected = document.querySelector(`input[name="level"][value="${settings.level}"]`);
  if (selected) selected.checked = true;

  enabled.addEventListener("change", () => chrome.storage.local.set({ enabled: enabled.checked }));
  for (const radio of document.querySelectorAll('input[name="level"]')) {
    radio.addEventListener("change", () => chrome.storage.local.set({ level: Number(radio.value) }));
  }
}
