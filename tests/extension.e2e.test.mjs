import { test as base, chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "../extension");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");

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

test("never exposes original prose while the first adjusted paragraph is pending", async ({ context }) => {
  const api = await startFakeApi({ delayMs: 500 });
  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await serviceWorker.evaluate(async ({ apiBaseUrl }) => {
    await chrome.storage.local.set({ enabled: true, level: 2, apiBaseUrl });
  }, { apiBaseUrl: api.url });

  const page = await context.newPage();
  await page.route("https://en.wikipedia.org/wiki/Photosynthesis", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: wikipediaFixture,
  }));

  await page.goto("https://en.wikipedia.org/wiki/Photosynthesis", { waitUntil: "domcontentloaded" });
  const intro = page.locator("#intro");

  await expect(intro).toBeHidden();
  await expect(page.locator("#firstHeading")).toBeVisible();
  await expect(page.locator('img[alt="A green leaf"]')).toBeVisible();

  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.", { timeout: 5_000 });
  await expect(intro).toBeVisible();
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 2");

  await api.close();
});

test("adjusted mode persists across normal Wikipedia navigation", async ({ context }) => {
  const api = await startFakeApi({ delayMs: 0 });
  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await serviceWorker.evaluate(async ({ apiBaseUrl }) => {
    await chrome.storage.local.set({ enabled: true, level: 3, apiBaseUrl });
  }, { apiBaseUrl: api.url });

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

test("restores original prose if adjustment fails instead of leaving the page blocked", async ({ context }) => {
  const server = createServer(async (_request, response) => {
    response.statusCode = 503;
    response.end("unavailable");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await serviceWorker.evaluate(async ({ apiBaseUrl }) => {
    await chrome.storage.local.set({ enabled: true, level: 2, apiBaseUrl });
  }, { apiBaseUrl: `http://127.0.0.1:${port}` });

  const page = await context.newPage();
  await page.route("https://en.wikipedia.org/wiki/Photosynthesis", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: wikipediaFixture,
  }));

  await page.goto("https://en.wikipedia.org/wiki/Photosynthesis");
  await expect(page.locator("#intro")).toContainText("Photosynthesis is a system of biological processes");
  await expect(page.locator("#intro")).toBeVisible();

  await new Promise((resolve) => server.close(resolve));
});

test("popup changes the persisted reading level", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await page.getByLabel("Level 1").check();
  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await expect.poll(() => serviceWorker.evaluate(async () => (await chrome.storage.local.get("level")).level)).toBe(1);
});

async function startFakeApi({ delayMs }) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/simplify") {
      response.statusCode = 404;
      return response.end();
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const blocks = body.blocks.map((block) => ({
      id: block.id,
      text: block.id === "block-0"
        ? "Plants use photosynthesis to turn light into energy they can use."
        : "Most photosynthesis also releases oxygen as a waste product.",
    }));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ blocks }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
