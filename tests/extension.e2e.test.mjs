import { test as base, chromium, expect } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensionPath = path.resolve(here, "../extension");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");
const articleFixture = await readFile(path.join(here, "fixtures/article.html"), "utf8");
const TEST_KEY = "sk-test-plainly-browser-integration-key";
const SLOW_TEST_KEY = "sk-test-plainly-slow-browser-integration-key";
const FAIL_TEST_KEY = "sk-test-plainly-fail-browser-integration-key";

const fakeOpenAIAdapter = `
export async function simplifyWithOpenAI({ apiKey, payload }) {
  if (typeof apiKey !== "string" || apiKey.length < 20) throw new Error("Missing test API key");
  if (apiKey.includes("fail")) throw new Error("Synthetic OpenAI failure");
  if (apiKey.includes("slow")) await new Promise((resolve) => setTimeout(resolve, 500));
  if (payload.blocks.some((block) => block.id.startsWith("block-"))) {
    throw new Error("Expected stable KMP block keys, not legacy DOM indexes");
  }
  if (!payload.readingTarget?.guidance || !payload.readingTarget?.schemeId) {
    throw new Error("Expected reading target resolved by KMP");
  }
  return payload.blocks.map((block) => ({
    id: block.id,
    text: block.text.startsWith("Photosynthesis is")
      ? "Plants use photosynthesis to turn light into energy they can use."
      : block.text.startsWith("Urban trees reduce")
        ? "City trees can make hot streets cooler by giving shade and releasing water from their leaves."
        : block.text.startsWith("Trees also intercept")
          ? "Trees can catch rain, provide homes for wildlife, and make neighbourhoods nicer to walk through."
          : block.text.startsWith("Researchers therefore")
            ? "Researchers study city trees as important infrastructure as well as living ecosystems."
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

test("never exposes original prose while the first Oxford-target paragraph is pending", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: SLOW_TEST_KEY, scheme: "oxford", level: "8" });
  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");

  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(page.locator('img[alt="A green leaf"]')).toBeVisible();
  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Oxford 8");
  await expect(page.locator("#plainly-indicator")).toHaveAttribute("data-engine", "kmp");
  await expect(page.locator("#plainly-indicator")).toHaveAttribute("data-article-kind", "wikipedia");
});

test("adjusts a semantic web article without touching navigation or sidebar copy", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: SLOW_TEST_KEY, scheme: "oxford", level: "8" });
  const page = await openArticle(context);
  const intro = page.locator("#article-intro");

  await expect(intro).toBeHidden();
  await expect(page.getByRole("heading", { name: "Why city trees matter" })).toBeVisible();
  await expect(page.locator("#nav-copy")).toHaveText("Subscribe for more stories and browse all sections.");
  await expect(page.locator("#sidebar-copy")).toContainText("Related story");
  await expect(intro).toHaveText("City trees can make hot streets cooler by giving shade and releasing water from their leaves.", { timeout: 5_000 });
  await expect(page.locator("#article-second")).toContainText("Trees can catch rain");
  await expect(page.locator("#article-third")).toContainText("Researchers study city trees");
  await expect(page.locator("#nav-copy")).toHaveText("Subscribe for more stories and browse all sections.");
  await expect(page.locator("#sidebar-copy")).toContainText("ten gardens to visit");
  await expect(page.locator("#plainly-indicator")).toHaveAttribute("data-article-kind", "web");
});

test("adjusted target persists across Wikipedia navigation", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: TEST_KEY, scheme: "fountasPinnell", level: "M" });
  const page = await context.newPage();
  await page.route("https://en.wikipedia.org/wiki/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: wikipediaFixture }));

  await page.goto("https://en.wikipedia.org/wiki/Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Plants use photosynthesis");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · F&P M");
  await page.goto("https://en.wikipedia.org/wiki/Plant");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · F&P M");
});

test("DIBELS settings produce and persist the KMP recommendation", async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).not.toHaveText("Checking…");
  await popup.getByLabel("Reading scheme").selectOption("dibelsMaze");
  await popup.getByLabel("Reading level").selectOption("4");
  await popup.getByLabel("DIBELS benchmark period").selectOption("middle");
  await popup.getByLabel("DIBELS Maze score").fill("14");
  await popup.getByLabel("DIBELS Maze score").blur();
  await expect(popup.locator("#dibels-recommendation")).toContainText("Grade 3");
  await expect(popup.locator("#dibels-recommendation")).toContainText("520–820L");
  await waitForTarget(popup, { scheme: "dibelsMaze", level: "4", dibelsPeriod: "middle", dibelsMazeScore: "14" });
  await popup.close();

  const reopened = await openPopup(context, extensionId);
  await expect(reopened.getByLabel("Reading scheme")).toHaveValue("dibelsMaze");
  await expect(reopened.getByLabel("Reading level")).toHaveValue("4");
  await expect(reopened.getByLabel("DIBELS Maze score")).toHaveValue("14");
});

test("restores original prose if OpenAI fails", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: FAIL_TEST_KEY, scheme: "oxford", level: "8" });
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");
});

test("does not hide Wikipedia when no API key has been configured", async ({ context }) => {
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveCount(0);
});

test("popup stores the API key without displaying it back", async ({ context, extensionId }) => {
  let popup = await openPopup(context, extensionId);
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
});

async function configureExtension(context, extensionId, { apiKey, scheme, level }) {
  const popup = await openPopup(context, extensionId);
  const keyInput = popup.getByRole("textbox", { name: "OpenAI API key" });
  await keyInput.fill(apiKey);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");
  await popup.getByLabel("Reading scheme").selectOption(scheme);
  await popup.getByLabel("Reading level").selectOption(level);
  await waitForTarget(popup, { scheme, level });
  await popup.close();
}

async function waitForTarget(popup, expected) {
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return response.settings;
  })).toMatchObject(expected);
}

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

async function openWikipedia(context, title) {
  const page = await context.newPage();
  const url = `https://en.wikipedia.org/wiki/${title}`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: wikipediaFixture }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function openArticle(context) {
  const page = await context.newPage();
  const url = "https://example.test/news/city-trees";
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: articleFixture }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}
