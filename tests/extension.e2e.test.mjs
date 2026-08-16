import { test as base, chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "../extension");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");
const TEST_KEY = "sk-test-plainly-browser-integration-key";

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
    const serviceWorker = await getServiceWorker(context);
    await use(new URL(serviceWorker.url()).host);
  },
});

test("never exposes original prose while the first adjusted paragraph is pending", async ({ context }) => {
  const api = await startFakeOpenAI({ delayMs: 500 });
  await configureExtension(context, { level: 2, apiUrl: api.url });

  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");

  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(page.locator('img[alt="A green leaf"]')).toBeVisible();

  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 2");
  expect(api.requests[0].authorization).toBe(`Bearer ${TEST_KEY}`);

  await api.close();
});

test("does not hide Wikipedia when no API key has been configured", async ({ context }) => {
  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveCount(0);
});

test("adjusted mode persists across normal Wikipedia navigation", async ({ context }) => {
  const api = await startFakeOpenAI({ delayMs: 0 });
  await configureExtension(context, { level: 3, apiUrl: api.url });

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

  await api.close();
});

test("restores original prose if OpenAI fails instead of leaving the page blocked", async ({ context }) => {
  const server = createServer((_request, response) => {
    response.statusCode = 503;
    response.end("unavailable");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  await configureExtension(context, {
    level: 2,
    apiUrl: `http://127.0.0.1:${port}/v1/responses`,
  });

  const page = await openWikipedia(context, "Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");

  await new Promise((resolve) => server.close(resolve));
});

test("popup saves and removes a user API key without displaying it back", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const keyInput = page.getByRole("textbox", { name: "OpenAI API key" });

  await keyInput.fill(TEST_KEY);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("API key saved on this device.");
  await expect(keyInput).toHaveValue("");

  const serviceWorker = await getServiceWorker(context);
  await expect.poll(() => serviceWorker.evaluate(async () => (
    await chrome.storage.local.get("openAIApiKey")
  ).openAIApiKey)).toBe(TEST_KEY);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status")).toHaveText("No API key saved.");
  await expect.poll(() => serviceWorker.evaluate(async () => (
    await chrome.storage.local.get("openAIApiKey")
  ).openAIApiKey)).toBeUndefined();
});

test("popup changes the persisted reading level", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await page.getByLabel("Level 1").check();
  const serviceWorker = await getServiceWorker(context);
  await expect.poll(() => serviceWorker.evaluate(async () => (
    await chrome.storage.local.get("level")
  ).level)).toBe(1);
});

async function configureExtension(context, { level, apiUrl }) {
  const serviceWorker = await getServiceWorker(context);
  await serviceWorker.evaluate(async ({ level, apiUrl, apiKey }) => {
    await chrome.storage.local.set({
      enabled: true,
      level,
      openAIApiKey: apiKey,
      openAIApiUrl: apiUrl,
    });
  }, { level, apiUrl, apiKey: TEST_KEY });
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

async function getServiceWorker(context) {
  const existing = context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://"));
  if (existing) return existing;

  while (true) {
    const worker = await context.waitForEvent("serviceworker");
    if (worker.url().startsWith("chrome-extension://")) return worker;
  }
}

async function startFakeOpenAI({ delayMs }) {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.statusCode = 404;
      return response.end();
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const input = JSON.parse(body.input[1].content[0].text);
    requests.push({ authorization: request.headers.authorization, body, input });

    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const blocks = input.blocks.map((block) => ({
      id: block.id,
      text: block.id === "block-0"
        ? "Plants use photosynthesis to turn light into energy they can use."
        : "Most photosynthesis also releases oxygen as a waste product.",
    }));

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify({ blocks }) }],
      }],
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1/responses`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
