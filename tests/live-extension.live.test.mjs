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
const TARGET = Object.freeze({ scheme: "oxford", level: "8", label: "Oxford 8" });

test("real OpenAI key adjusts Wikipedia through the shipped KMP extension", async () => {
  test.skip(!apiKey, "AI_SECRET is required for the live integration test");
  await mkdir(artifactsPath, { recursive: true });

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    const extensionId = await getExtensionId(context);
    await configureExtension(context, extensionId);

    const page = await context.newPage();
    await page.route(DEMO_URL, (route) => route.fulfill({ status: 200, contentType: "text/html", body: wikipediaFixture }));

    const startedAt = Date.now();
    await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
    const intro = page.locator("#intro");
    await expect(intro).toHaveAttribute("data-plainly-state", "ready", { timeout: 60_000 });
    const firstAdjustedParagraphMs = Date.now() - startedAt;
    await expect(page.locator("#second")).toHaveAttribute("data-plainly-state", "ready", { timeout: 60_000 });
    await expect(page.locator("#plainly-indicator")).toHaveText(`Plainly · ${TARGET.label}`);
    await expect(page.locator("#plainly-indicator")).toHaveAttribute("data-engine", "kmp");

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
      readingTarget: TARGET,
      model: DEFAULT_MODEL,
      firstAdjustedParagraphMs,
      blocks,
    };
    await writeFile(path.join(artifactsPath, "plainly-live-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

    await decorateWikipediaDemo(page, firstAdjustedParagraphMs);
    await page.screenshot({ path: path.join(artifactsPath, "plainly-live-wikipedia.png"), fullPage: true });
    const comparisonHtml = buildComparisonHtml(result);
    await writeFile(path.join(artifactsPath, "plainly-before-after.html"), comparisonHtml, "utf8");
    const comparisonPage = await context.newPage();
    await comparisonPage.setContent(comparisonHtml, { waitUntil: "load" });
    await comparisonPage.screenshot({ path: path.join(artifactsPath, "plainly-before-after.png"), fullPage: true });
    await comparisonPage.close();

    await writeFile(path.join(artifactsPath, "README.txt"), [
      "Plainly live demo artifacts",
      "",
      `Reading target: ${TARGET.label}`,
      `First adjusted paragraph: ${firstAdjustedParagraphMs} ms`,
      "The shipped extension, KMP target resolver, and real OpenAI adapter are all exercised.",
      "No API key, browser profile, trace, or request headers are included.",
      "",
    ].join("\n"), "utf8");
  } finally {
    await context.close();
  }
});

async function getExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers().filter((worker) => worker.url().startsWith("chrome-extension://"));
  if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { predicate: (worker) => worker.url().startsWith("chrome-extension://") });
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
  await popup.getByLabel("Reading scheme").selectOption(TARGET.scheme);
  await popup.getByLabel("Reading level").selectOption(TARGET.level);
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return { scheme: response.settings.scheme, level: response.settings.level };
  })).toEqual({ scheme: TARGET.scheme, level: TARGET.level });
  await popup.close();
}

async function decorateWikipediaDemo(page, latencyMs) {
  await page.addStyleTag({ content: `
    body{margin:0;background:#f8f9fa;color:#202122;font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#plainly-demo-banner{box-sizing:border-box;width:100%;padding:18px 28px;border-bottom:1px solid #c8ccd1;background:white;font-weight:650}#plainly-demo-banner span{margin-left:12px;color:#54595d;font-weight:400}#firstHeading,#mw-content-text{max-width:920px;margin-left:auto;margin-right:auto}#firstHeading{margin-top:42px;border-bottom:1px solid #a2a9b1;font:38px/1.2 Georgia,"Times New Roman",serif}#mw-content-text{margin-top:20px;margin-bottom:64px;padding:30px 38px;border:1px solid #c8ccd1;border-radius:8px;background:white}#mw-content-text figure{display:none}#plainly-indicator{bottom:28px!important;right:28px!important}
  ` });
  await page.evaluate(({ label, latencyMs }) => {
    const banner = document.createElement("div");
    banner.id = "plainly-demo-banner";
    banner.textContent = "Plainly · Live OpenAI demo";
    const detail = document.createElement("span");
    detail.textContent = `${label} · first paragraph ${latencyMs} ms`;
    banner.append(detail);
    document.body.prepend(banner);
  }, { label: TARGET.label, latencyMs });
}

function buildComparisonHtml(result) {
  const cards = result.blocks.map((block, index) => `
    <section class="pair"><div class="card"><div class="eyebrow">Original · paragraph ${index + 1}</div><p>${escapeHtml(block.original)}</p></div><div class="arrow">→</div><div class="card adjusted"><div class="eyebrow">Plainly · ${TARGET.label}</div><p>${escapeHtml(block.adjusted)}</p></div></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plainly live comparison</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#17191c;font:18px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1180px,calc(100% - 48px));margin:auto;padding:58px 0 70px}.brand{font-size:15px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{font-size:46px;line-height:1.08}.meta{color:#62676f}.pair{display:grid;grid-template-columns:minmax(0,1fr) 46px minmax(0,1fr);margin:22px 0}.card{padding:26px 28px;border:1px solid #d8dbe1;border-radius:14px;background:white}.adjusted{border-width:2px}.eyebrow{margin-bottom:16px;font-size:13px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#62676f}.arrow{display:grid;place-items:center;font-size:28px;color:#747981}</style></head><body><main><div class="brand">Plainly</div><h1>Live before and after</h1><div class="meta">${TARGET.label} · ${result.model} · first paragraph ${result.firstAdjustedParagraphMs} ms</div>${cards}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
