import { test as base, chromium, expect } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensionPath = path.resolve(here, "../extension");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");
const TEST_KEY = "sk-test-plainly-browser-integration-key";
const SLOW_TEST_KEY = "sk-test-plainly-slow-browser-integration-key";
const FAIL_TEST_KEY = "sk-test-plainly-fail-browser-integration-key";

const fakeOpenAIAdapter = `
export async function simplifyWithOpenAI({ apiKey, payload }) {
  if (typeof apiKey !== "string" || apiKey.length < 20) throw new Error("Missing test API key");
  if (apiKey.includes("fail")) throw new Error("Synthetic OpenAI failure");
  if (apiKey.includes("slow")) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!payload.scheme || !payload.level) throw new Error("Missing reading target");
  return payload.blocks.map((block) => ({ id: block.id, text: block.id === "block-0" ? "Plants use photosynthesis to turn light into energy they can use." : "Most photosynthesis also releases oxygen as a waste product." }));
}
`;

const test = base.extend({
  context: async ({}, use) => {
    const testRoot = await mkdtemp(path.join(tmpdir(), "plainly-e2e-"));
    const extensionPath = path.join(testRoot, "extension");
    await cp(sourceExtensionPath, extensionPath, { recursive: true });
    await writeFile(path.join(extensionPath, "openai.js"), fakeOpenAIAdapter, "utf8");
    const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    try { await use(context); } finally { await context.close(); await rm(testRoot, { recursive: true, force: true }); }
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    await use(new URL(serviceWorker.url()).host);
  },
});

test("never exposes original prose while Oxford adjustment is pending", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: SLOW_TEST_KEY, scheme: "oxford", level: "8" });
  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");
  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Oxford 8");
});

test("Fountas & Pinnell target persists across Wikipedia navigation", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: TEST_KEY, scheme: "fountasPinnell", level: "M" });
  const page = await context.newPage();
  await page.route("https://en.wikipedia.org/wiki/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: wikipediaFixture }));
  await page.goto("https://en.wikipedia.org/wiki/Photosynthesis");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · F&P M");
  await page.goto("https://en.wikipedia.org/wiki/Plant");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · F&P M");
});

test("popup persists reading scheme and level", async ({ context, extensionId }) => {
  let popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).not.toHaveText("Checking…");
  await popup.getByLabel("Reading scheme").selectOption("fountasPinnell");
  await popup.getByLabel("Level").selectOption("M");
  await waitForTarget(popup, "fountasPinnell", "M");
  await expect(popup.getByText(/does not assign an official F&P level/i)).toBeVisible();
  await popup.close();
  popup = await openPopup(context, extensionId);
  await expect(popup.getByLabel("Reading scheme")).toHaveValue("fountasPinnell");
  await expect(popup.getByLabel("Level")).toHaveValue("M");
});

test("restores original prose if adjustment fails", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: FAIL_TEST_KEY, scheme: "oxford", level: "8" });
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");
});

async function configureExtension(context, extensionId, { apiKey, scheme, level }) {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
  await popup.getByRole("textbox", { name: "OpenAI API key" }).fill(apiKey);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");
  await popup.getByLabel("Reading scheme").selectOption(scheme);
  await popup.getByLabel("Level").selectOption(level);
  await waitForTarget(popup, scheme, level);
  await popup.close();
}

async function waitForTarget(popup, expectedScheme, expectedLevel) {
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return `${response.settings.scheme}:${response.settings.level}`;
  })).toBe(`${expectedScheme}:${expectedLevel}`);
}

async function openPopup(context, extensionId) { const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/popup.html`); return page; }
async function openWikipedia(context, title) {
  const page = await context.newPage(); const url = `https://en.wikipedia.org/wiki/${title}`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: wikipediaFixture }));
  await page.goto(url, { waitUntil: "domcontentloaded" }); return page;
}
