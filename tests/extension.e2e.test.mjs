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
  if (typeof apiKey !== "string" || apiKey.length < 20) {
    throw new Error("Missing test API key");
  }
  if (apiKey.includes("fail")) {
    throw new Error("Synthetic OpenAI failure");
  }
  if (apiKey.includes("slow")) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (payload.blocks.some((block) => block.id.startsWith("block-"))) {
    throw new Error("Expected stable KMP block keys, not legacy DOM indexes");
  }

  return payload.blocks.map((block) => ({
    id: block.id,
    text: block.text.startsWith("Photosynthesis is")
      ? "Plants use photosynthesis to turn light into energy they can use."
      : "Most photosynthesis also releases oxygen as a waste product.",
  }));
}
`;

const test = base.extend({
  context: async ({}, use) => {
    const testRoot = await mkdtemp(path.join(tmpdir(), "plainly-e2e-"));
    const extensionPath = path.join(testRoot, "extension");
    await cp(sourceExtensionPath, extensionPath, { recursive: true });
    await writeFile(path.join(extensionPath, "openai.js"), fakeOpenAIAdapter, "utf8");

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(testRoot, { recursive: true, force: true });
    }
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    await use(new URL(serviceWorker.url()).host);
  },
});

test("never exposes original prose while the first adjusted paragraph is pending", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: SLOW_TEST_KEY, level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");

  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(page.locator('img[alt="A green leaf"]')).toBeVisible();

  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 2");
  await expect(page.locator("#plainly-indicator")).toHaveAttribute("data-engine", "kmp");
});

test("does not hide Wikipedia when no API key has been configured", async ({ context }) => {
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveCount(0);
});

test("adjusted mode persists across normal Wikipedia navigation", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: TEST_KEY, level: 3 });

  const page = await context.newPage();
  await page.route("https://en.wikipedia.org/wiki/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: wikipediaFixture,
  }));

  await page.goto("https://en.wikipedia.org/wiki/Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Plants use photosynthesis");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 3");

  await page.goto("https://en.wikipedia.org/wiki/Plant");
  await expect(page.locator("#intro")).toContainText("Plants use photosynthesis");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 3");
});

test("restores original prose if OpenAI fails instead of leaving the page blocked", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: FAIL_TEST_KEY, level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");
});

test("popup saves and removes a user API key without displaying it back", async ({ context, extensionId }) => {
  let popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
  const keyInput = popup.getByRole("textbox", { name: "OpenAI API key" });

  await keyInput.fill(TEST_KEY);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");
  await expect(keyInput).toHaveValue("");
  await popup.close();

  popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("API key saved.");
  await expect(popup.getByRole("textbox", { name: "OpenAI API key" })).toHaveValue("");
  await popup.getByRole("button", { name: "Remove" }).click();
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
  await popup.close();

  popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
});

test("popup persists the selected reading level", async ({ context, extensionId }) => {
  let popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).not.toHaveText("Checking…");
  await popup.getByLabel("Level 1").check();
  await waitForLevel(popup, 1);
  await popup.close();

  popup = await openPopup(context, extensionId);
  await expect(popup.getByLabel("Level 1")).toBeChecked();
});

async function configureExtension(context, extensionId, { apiKey, level }) {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
  const keyInput = popup.getByRole("textbox", { name: "OpenAI API key" });
  await keyInput.fill(apiKey);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");

  if (level !== 2) {
    await popup.getByLabel(`Level ${level}`).check();
    await waitForLevel(popup, level);
  }
  await popup.close();
}

async function waitForLevel(popup, expectedLevel) {
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return response.settings.level;
  })).toBe(expectedLevel);
}

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

async function openWikipedia(context, title) {
  const page = await context.newPage();
  const url = `https://en.wikipedia.org/wiki/${title}`;
  await page.route(url, (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: wikipediaFixture,
  }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}
