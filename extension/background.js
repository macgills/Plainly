import { DEFAULT_MODEL, DEFAULT_OPENAI_API_URL, simplifyWithOpenAI } from "./openai.js";

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, level: 2 });

void restrictSecretStorage();
chrome.runtime.onInstalled.addListener(() => void restrictSecretStorage());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith("PLAINLY_")) return false;

  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "PLAINLY_GET_SETTINGS":
      return { ok: true, settings: await getPublicSettings() };
    case "PLAINLY_UPDATE_SETTINGS":
      await updateSettings(message.settings);
      return { ok: true, settings: await getPublicSettings() };
    case "PLAINLY_SAVE_API_KEY":
      await saveApiKey(message.apiKey);
      return { ok: true, settings: await getPublicSettings() };
    case "PLAINLY_REMOVE_API_KEY":
      await chrome.storage.local.remove("openAIApiKey");
      return { ok: true, settings: await getPublicSettings() };
    case "PLAINLY_SIMPLIFY":
      return { ok: true, blocks: await simplify(message.payload) };
    default:
      return { ok: false, error: "Unknown Plainly message" };
  }
}

async function getPublicSettings() {
  const stored = await chrome.storage.local.get({
    ...DEFAULT_SETTINGS,
    openAIApiKey: "",
  });

  return {
    enabled: stored.enabled,
    level: stored.level,
    hasApiKey: typeof stored.openAIApiKey === "string" && stored.openAIApiKey.length >= 20,
  };
}

async function updateSettings(settings) {
  const update = {};
  if (Object.hasOwn(settings ?? {}, "enabled")) {
    if (typeof settings.enabled !== "boolean") throw new Error("enabled must be a boolean");
    update.enabled = settings.enabled;
  }
  if (Object.hasOwn(settings ?? {}, "level")) {
    if (![1, 2, 3].includes(settings.level)) throw new Error("level must be 1, 2, or 3");
    update.level = settings.level;
  }
  await chrome.storage.local.set(update);
}

async function saveApiKey(apiKey) {
  const normalized = typeof apiKey === "string" ? apiKey.trim() : "";
  if (normalized.length < 20) throw new Error("Enter a valid OpenAI API key");
  await chrome.storage.local.set({ openAIApiKey: normalized });
}

async function simplify(payload) {
  const stored = await chrome.storage.local.get({
    openAIApiKey: "",
    openAIApiUrl: DEFAULT_OPENAI_API_URL,
    plainlyModel: DEFAULT_MODEL,
  });

  return simplifyWithOpenAI({
    apiKey: stored.openAIApiKey,
    apiUrl: stored.openAIApiUrl,
    model: stored.plainlyModel,
    payload,
  });
}

async function restrictSecretStorage() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("Plainly could not restrict extension storage access.", error);
  }
}
