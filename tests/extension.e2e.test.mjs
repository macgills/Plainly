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
const DROP_LINK_TEST_KEY = "sk-test-plainly-drop-link-integration-key";
const DROP_CITATION_TEST_KEY = "sk-test-plainly-drop-citation-integration-key";

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
  if (payload.blocks.some((block) => block.text.includes("[1]"))) {
    throw new Error("Human-readable citation labels must not enter simplification or KMP fidelity prose");
  }

  const linkedIntro = payload.blocks.find((block) => block.text.startsWith("Photosynthesis is"));
  if (linkedIntro && !linkedIntro.protectedLinkTexts?.includes("plants")) {
    throw new Error("Expected Wikipedia link text to be protected in the provider request");
  }

  const citedOverview = payload.blocks.find((block) => block.text.startsWith("In most cases"));
  if (citedOverview) {
    const markers = citedOverview.protectedCitationMarkers ?? [];
    if (markers.length !== 1 || !/^⟦PLAINLY_CITATION_[A-Z]+⟧$/.test(markers[0])) {
      throw new Error("Expected one opaque protected citation marker");
    }
    if (!citedOverview.text.includes(markers[0])) {
      throw new Error("Expected the opaque citation marker at its source position in provider text");
    }
  }

  return payload.blocks.map((block) => {
    if (block.text.startsWith("Photosynthesis is")) {
      return {
        id: block.id,
        text: apiKey.includes("drop-link")
          ? "Photosynthesis turns light into energy organisms can use."
          : "Plants use photosynthesis to turn light into energy they can use.",
      };
    }

    const marker = block.protectedCitationMarkers?.[0] ?? "";
    return {
      id: block.id,
      text: apiKey.includes("drop-citation")
        ? "Most photosynthesis releases oxygen as a waste product. It also makes carbohydrates that store energy for later."
        : \`Most photosynthesis releases oxygen as a waste product. \${marker} It also makes carbohydrates that store energy for later.\`,
    };
  });
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

test("preserves Wikipedia links and citation positions across adjusted and original modes", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: TEST_KEY, level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");
  const second = page.locator("#second");
  const plantLink = intro.locator('a[href="/wiki/Plant"]');
  const citation = second.locator('sup.reference a[href="#cite_note-1"]');
  const indicator = page.locator("#plainly-indicator");

  await expect(second).toHaveAttribute("data-plainly-state", "ready");
  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.");
  await expect(plantLink).toHaveText("Plants");
  await expect(plantLink).toHaveAttribute("title", "Plant");
  await expect(citation).toHaveText("[1]");
  expect(await second.evaluate((element) => element.textContent)).toBe(
    "Most photosynthesis releases oxygen as a waste product.[1] It also makes carbohydrates that store energy for later.",
  );

  await indicator.click();
  await expect(indicator).toHaveText("Plainly · Original");
  await expect(intro).toContainText("Photosynthesis is a system of biological processes");
  await expect(plantLink).toHaveText("plants");
  await expect(citation).toHaveText("[1]");
  expect(await second.evaluate((element) => element.textContent)).toBe(
    "In most cases, photosynthesis releases oxygen as a waste product.[1] It also produces carbohydrates that store chemical energy for the organism to use later.",
  );

  await indicator.click();
  await expect(indicator).toHaveText("Plainly · Level 2");
  await expect(intro).toHaveText("Plants use photosynthesis to turn light into energy they can use.");
  await expect(plantLink).toHaveText("Plants");
  await expect(citation).toHaveText("[1]");
  expect(await second.evaluate((element) => element.textContent)).toBe(
    "Most photosynthesis releases oxygen as a waste product.[1] It also makes carbohydrates that store energy for later.",
  );
});

test("fails open with the original linked prose if adjustment drops a protected link term", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: DROP_LINK_TEST_KEY, level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  const intro = page.locator("#intro");
  const plantLink = intro.locator('a[href="/wiki/Plant"]');

  await expect(intro).toContainText("Photosynthesis is a system of biological processes");
  await expect(intro).toBeVisible();
  await expect(plantLink).toHaveText("plants");
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Couldn’t adjust");
});

test("fails open with the original cited prose if adjustment drops a citation marker", async ({ context, extensionId }) => {
  await configureExtension(context, extensionId, { apiKey: DROP_CITATION_TEST_KEY, level: 2 });

  const page = await openWikipedia(context, "Photosynthesis");
  const second = page.locator("#second");
  const citation = second.locator('sup.reference a[href="#cite_note-1"]');

  await expect(page.locator("#intro")).toHaveAttribute("data-plainly-state", "ready");
  await expect(second).toHaveAttribute("data-plainly-state", "error");
  await expect(second).toBeVisible();
  await expect(citation).toHaveText("[1]");
  expect(await second.evaluate((element) => element.textContent)).toBe(
    "In most cases, photosynthesis releases oxygen as a waste product.[1] It also produces carbohydrates that store chemical energy for the organism to use later.",
  );
  await expect(page.locator("#plainly-indicator")).toHaveText("Plainly · Level 2");
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
