import { chromium, expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL } from "../extension/openai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "../extension");
const artifactsPath = path.resolve(here, "../artifacts");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");
const apiKey = process.env.AI_SECRET;

const DEMO_URL = "https://en.wikipedia.org/wiki/Photosynthesis";
const LEVEL = 1;

test("real OpenAI key adjusts Wikipedia through the shipped extension and emits demo artifacts", async () => {
  test.skip(!apiKey, "AI_SECRET is required for the live integration test");
  await mkdir(artifactsPath, { recursive: true });

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const extensionId = await getExtensionId(context);
    await configureExtension(context, extensionId);

    const page = await context.newPage();
    await page.route(DEMO_URL, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: wikipediaFixture,
    }));

    const startedAt = Date.now();
    await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });

    const intro = page.locator("#intro");
    await expect(intro).toHaveAttribute("data-plainly-state", "ready", { timeout: 60_000 });
    const firstAdjustedParagraphMs = Date.now() - startedAt;
    await expect(page.locator("#second")).toHaveAttribute("data-plainly-state", "ready", { timeout: 60_000 });
    await expect(page.locator("#plainly-indicator")).toHaveText(`Plainly · Level ${LEVEL}`);

    const blocks = await page.locator('[data-plainly-state="ready"]').evaluateAll((elements) => elements.map((element) => ({
      original: element.dataset.plainlyOriginal ?? "",
      adjusted: element.textContent?.trim() ?? "",
    })));

    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      expect(block.original.length).toBeGreaterThan(0);
      expect(block.adjusted.length).toBeGreaterThan(0);
      expect(block.adjusted).not.toBe(block.original);
    }

    const result = {
      generatedAt: new Date().toISOString(),
      title: "Photosynthesis",
      level: LEVEL,
      model: DEFAULT_MODEL,
      firstAdjustedParagraphMs,
      blocks,
    };

    await writeFile(
      path.join(artifactsPath, "plainly-live-result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    await decorateWikipediaDemo(page, firstAdjustedParagraphMs, LEVEL);
    await page.screenshot({
      path: path.join(artifactsPath, "plainly-live-wikipedia.png"),
      fullPage: true,
    });

    const comparisonHtml = buildComparisonHtml(result);
    await writeFile(path.join(artifactsPath, "plainly-before-after.html"), comparisonHtml, "utf8");

    const comparisonPage = await context.newPage();
    await comparisonPage.setContent(comparisonHtml, { waitUntil: "load" });
    await comparisonPage.screenshot({
      path: path.join(artifactsPath, "plainly-before-after.png"),
      fullPage: true,
    });
    await comparisonPage.close();

    await writeFile(
      path.join(artifactsPath, "README.txt"),
      [
        "Plainly live demo artifacts",
        "",
        "plainly-live-wikipedia.png  - the shipped extension transforming a Wikipedia fixture in Chromium using the real OpenAI API",
        "plainly-before-after.png    - shareable before/after comparison",
        "plainly-before-after.html   - standalone comparison page",
        "plainly-live-result.json    - sanitized live result and latency metadata",
        "",
        "No API key, browser profile, trace, or request headers are included in these artifacts.",
        "",
      ].join("\n"),
      "utf8",
    );
  } finally {
    await context.close();
  }
});

async function getExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers().filter((worker) => worker.url().startsWith("chrome-extension://"));
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {
      predicate: (worker) => worker.url().startsWith("chrome-extension://"),
    });
  }
  return new URL(serviceWorker.url()).host;
}

async function configureExtension(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const status = popup.getByRole("status");
  await expect(status).not.toHaveText("Checking…", { timeout: 5_000 });

  const keyInput = popup.getByRole("textbox", { name: "OpenAI API key" });
  await keyInput.fill(apiKey);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(status).toHaveText("API key saved on this device.", { timeout: 5_000 });
  await expect(keyInput).toHaveValue("");

  await popup.getByLabel(`Level ${LEVEL}`).check();
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return response.settings.level;
  })).toBe(LEVEL);

  await popup.close();
}

async function decorateWikipediaDemo(page, latencyMs, level) {
  await page.addStyleTag({
    content: `
      body {
        margin: 0;
        background: #f8f9fa;
        color: #202122;
        font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #plainly-demo-banner {
        box-sizing: border-box;
        width: 100%;
        padding: 18px 28px;
        border-bottom: 1px solid #c8ccd1;
        background: white;
        font-weight: 650;
      }
      #plainly-demo-banner span {
        font-weight: 400;
        color: #54595d;
        margin-left: 12px;
      }
      #firstHeading, #mw-content-text {
        max-width: 920px;
        margin-left: auto;
        margin-right: auto;
      }
      #firstHeading {
        margin-top: 42px;
        margin-bottom: 0;
        padding-bottom: 10px;
        border-bottom: 1px solid #a2a9b1;
        font: 38px/1.2 Georgia, "Times New Roman", serif;
      }
      #mw-content-text {
        margin-top: 20px;
        margin-bottom: 64px;
        padding: 30px 38px;
        border: 1px solid #c8ccd1;
        border-radius: 8px;
        background: white;
      }
      #mw-content-text p { margin: 0 0 22px; }
      #mw-content-text h2 {
        margin-top: 30px;
        border-bottom: 1px solid #eaecf0;
        font: 26px/1.25 Georgia, "Times New Roman", serif;
      }
      #mw-content-text figure { display: none; }
      #plainly-indicator { bottom: 28px !important; right: 28px !important; }
    `,
  });

  await page.evaluate(({ latencyMs, level }) => {
    const banner = document.createElement("div");
    banner.id = "plainly-demo-banner";
    banner.textContent = "Plainly · Live integration";
    const detail = document.createElement("span");
    detail.textContent = `Wikipedia adjusted to Level ${level} · first paragraph ${latencyMs} ms`;
    banner.append(detail);
    document.body.prepend(banner);
  }, { latencyMs, level });
}

function buildComparisonHtml(result) {
  const cards = result.blocks.map((block, index) => `
    <section class="pair">
      <div class="card source">
        <div class="eyebrow">Original · paragraph ${index + 1}</div>
        <p>${escapeHtml(block.original)}</p>
      </div>
      <div class="arrow" aria-hidden="true">→</div>
      <div class="card adjusted">
        <div class="eyebrow">Plainly · Level ${result.level}</div>
        <p>${escapeHtml(block.adjusted)}</p>
      </div>
    </section>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plainly live demo</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f6f8; color: #17191c; font: 18px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 58px 0 70px; }
  header { margin-bottom: 34px; }
  .brand { font-size: 15px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  h1 { max-width: 820px; margin: 8px 0 10px; font-size: 46px; line-height: 1.08; }
  .meta { color: #62676f; }
  .pair { display: grid; grid-template-columns: minmax(0,1fr) 46px minmax(0,1fr); align-items: stretch; margin: 22px 0; }
  .card { min-height: 210px; padding: 26px 28px; border: 1px solid #d8dbe1; border-radius: 14px; background: white; box-shadow: 0 8px 30px rgba(0,0,0,.04); }
  .adjusted { border-width: 2px; }
  .eyebrow { margin-bottom: 16px; font-size: 13px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: #62676f; }
  .card p { margin: 0; }
  .arrow { display: grid; place-items: center; font-size: 28px; color: #747981; }
  footer { margin-top: 32px; color: #62676f; font-size: 14px; }
  @media (max-width: 760px) { .pair { grid-template-columns: 1fr; } .arrow { height: 42px; transform: rotate(90deg); } }
</style>
</head>
<body>
<main>
  <header>
    <div class="brand">Plainly</div>
    <h1>The same source, at the reader's level.</h1>
    <div class="meta">Live OpenAI integration · ${escapeHtml(result.title)} · Level ${result.level} · ${result.model} · first adjusted paragraph ${result.firstAdjustedParagraphMs} ms</div>
  </header>
  ${cards}
  <footer>Generated automatically by Plainly's live GitHub Actions integration test. The API key is not included in this artifact.</footer>
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
