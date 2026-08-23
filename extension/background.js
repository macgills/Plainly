import { simplifyWithOpenAI } from "./openai.js";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  scheme: "oxford",
  level: "8",
  dibelsPeriod: "middle",
  dibelsMazeScore: "",
});
const SCHEMES = new Set(["oxford", "fountasPinnell", "dibelsMaze"]);
const DIBELS_PERIODS = new Set(["beginning", "middle", "end"]);

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
  const stored = await chrome.storage.local.get([
    "enabled",
    "scheme",
    "level",
    "dibelsPeriod",
    "dibelsMazeScore",
    "openAIApiKey",
  ]);
  const hasReadingTarget = typeof stored.scheme === "string";

  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    scheme: hasReadingTarget ? stored.scheme : DEFAULT_SETTINGS.scheme,
    level: hasReadingTarget && typeof stored.level === "string" ? stored.level : DEFAULT_SETTINGS.level,
    dibelsPeriod: typeof stored.dibelsPeriod === "string" ? stored.dibelsPeriod : DEFAULT_SETTINGS.dibelsPeriod,
    dibelsMazeScore: typeof stored.dibelsMazeScore === "string" ? stored.dibelsMazeScore : DEFAULT_SETTINGS.dibelsMazeScore,
    hasApiKey: typeof stored.openAIApiKey === "string" && stored.openAIApiKey.length >= 20,
  };
}

async function updateSettings(settings) {
  const update = {};
  if (Object.hasOwn(settings ?? {}, "enabled")) {
    if (typeof settings.enabled !== "boolean") throw new Error("enabled must be a boolean");
    update.enabled = settings.enabled;
  }
  if (Object.hasOwn(settings ?? {}, "scheme")) {
    if (!SCHEMES.has(settings.scheme)) throw new Error("unsupported reading scheme");
    update.scheme = settings.scheme;
  }
  if (Object.hasOwn(settings ?? {}, "level")) {
    if (typeof settings.level !== "string" || settings.level.length === 0 || settings.level.length > 3) {
      throw new Error("level must be a short non-empty string");
    }
    update.level = settings.level;
  }
  if (Object.hasOwn(settings ?? {}, "dibelsPeriod")) {
    if (!DIBELS_PERIODS.has(settings.dibelsPeriod)) throw new Error("unsupported DIBELS benchmark period");
    update.dibelsPeriod = settings.dibelsPeriod;
  }
  if (Object.hasOwn(settings ?? {}, "dibelsMazeScore")) {
    const score = settings.dibelsMazeScore;
    if (typeof score !== "string" || (score !== "" && (!Number.isFinite(Number(score)) || Number(score) < 0))) {
      throw new Error("DIBELS Maze score must be empty or a non-negative number");
    }
    update.dibelsMazeScore = score;
  }
  await chrome.storage.local.set(update);
}

async function saveApiKey(apiKey) {
  const normalized = typeof apiKey === "string" ? apiKey.trim() : "";
  if (normalized.length < 20) throw new Error("Enter a valid OpenAI API key");
  await chrome.storage.local.set({ openAIApiKey: normalized });
}

async function simplify(payload) {
  const { openAIApiKey = "" } = await chrome.storage.local.get("openAIApiKey");
  return simplifyWithOpenAI({ apiKey: openAIApiKey, payload });
}

async function restrictSecretStorage() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("Plainly could not restrict extension storage access.", error);
  }
}
