import { test as base, chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "../extension");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");
const TEST_KEY = "sk-test-plainly-browser-integration-key";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    await use(new URL(serviceWorker.url()).host);
  },
});

test("never exposes original prose while the first adjusted paragraph is pending", async ({ context, extensionId }) => {
  const api = await mockOpenAI(context, { delayMs: 500 });
  await configureExtension(context, extensionId, { level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");

  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(page.locator('img[alt="A green leaf"]')).toBeVisible();

  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 2");

  expect(api.requests).not.toHaveLength(0);
  expect(api.requests[0].authorization).toBe(`Bearer ${TEST_KEY}`);
  expect(api.requests[0].fromServiceWorker).toBe(true);
});

test("does not hide Wikipedia when no API key has been configured", async ({ context }) => {
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveCount(0);
});

test("adjusted mode persists across normal Wikipedia navigation", async ({ context, extensionId }) => {
  await mockOpenAI(context);
  await configureExtension(context, extensionId, { level: 3 });

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
  await mockOpenAI(context, { status: 503 });
  await configureExtension(context, extensionId, { level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");
});

test("popup saves and removes a user API key without displaying it back", async ({ context, extensionId }) => {
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
  await popup.close();

  popup = await openPopup(context, extensionId);
  await expect(popup.getByRole("status")).toHaveText("No API key saved.");
});

test("popup persists the selected reading level", async ({ context, extensionId }) => {
  let popup = await openPopup(context, extensionId);
  await popup.getByLabel("Level 1").check();
  await popup.close();

  popup = await openPopup(context, extensionId);
  await expect(popup.getByLabel("Level 1")).toBeChecked();
});

async function configureExtension(context, extensionId, { level }) {
  const popup = await openPopup(context, extensionId);
  const keyInput = popup.getByRole("textbox", { name: "OpenAI API key" });
  await keyInput.fill(TEST_KEY);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");

  if (level !== 2) {
    await popup.getByLabel(`Level ${level}`).check();
  }
  await popup.close();
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

async function mockOpenAI(context, { delayMs = 0, status = 200 } = {}) {
  const requests = [];

  await context.route(OPENAI_RESPONSES_URL, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    requests.push({
      authorization: request.headers().authorization,
      body,
      fromServiceWorker: Boolean(request.serviceWorker()),
    });

    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (status !== 200) {
      await route.fulfill({ status, contentType: "text/plain", body: "unavailable" });
      return;
    }

    const input = JSON.parse(body.input[1].content[0].text);
    const blocks = input.blocks.map((block) => ({
      id: block.id,
      text: block.id === "block-0"
        ? "Plants use photosynthesis to turn light into energy they can use."
        : "Most photosynthesis also releases oxygen as a waste product.",
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ blocks }) }],
        }],
      }),
    });
  });

  return { requests };
}
