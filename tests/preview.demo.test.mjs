import { chromium, expect, test } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensionPath = path.resolve(here, "../extension");
const artifactsPath = path.resolve(here, "../artifacts-preview");
const wikipediaFixture = await readFile(path.join(here, "fixtures/wikipedia.html"), "utf8");

const DEMO_URL = "https://en.wikipedia.org/wiki/Photosynthesis";
const TEST_KEY = "sk-test-plainly-demo-preview-key";
const LEVEL = 1;

const previewAdapter = `
export const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_MODEL = "preview-fixture";

export async function simplifyWithOpenAI({ payload }) {
  const replacements = new Map([
    ["block-0", "Photosynthesis is how plants, algae, and some bacteria use light to make the chemical energy they need."],
    ["block-1", "Most photosynthesis also releases oxygen as a waste product."],
  ]);
  return payload.blocks.map((block) => ({
    id: block.id,
    text: replacements.get(block.id) ?? block.text,
  }));
}
`;

test("build a shareable deterministic Plainly preview", async () => {
  await mkdir(artifactsPath, { recursive: true });
  const testRoot = await mkdtemp(path.join(tmpdir(), "plainly-preview-"));
  const extensionPath = path.join(testRoot, "extension");
  await cp(sourceExtensionPath, extensionPath, { recursive: true });
  await writeFile(path.join(extensionPath, "openai.js"), previewAdapter, "utf8");

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
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 430, height: 650 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole("status")).not.toHaveText("Checking…");
    await popup.getByRole("textbox", { name: "OpenAI API key" }).fill(TEST_KEY);
    await popup.getByRole("button", { name: "Save" }).click();
    await expect(popup.getByRole("status")).toHaveText("API key saved on this device.");
    await popup.getByLabel(`Level ${LEVEL}`).check();
    await waitForLevel(popup, LEVEL);
    await popup.screenshot({ path: path.join(artifactsPath, "plainly-popup.png"), fullPage: true });
    await popup.close();

    const page = await context.newPage();
    await page.route(DEMO_URL, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: wikipediaFixture,
    }));
    await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#intro")).toHaveAttribute("data-plainly-state", "ready");
    await expect(page.locator("#second")).toHaveAttribute("data-plainly-state", "ready");

    const blocks = await page.locator('[data-plainly-state="ready"]').evaluateAll((elements) => elements.map((element) => ({
      original: element.dataset.plainlyOriginal ?? "",
      adjusted: element.textContent?.trim() ?? "",
    })));

    await decorateWikipediaPreview(page);
    await page.screenshot({
      path: path.join(artifactsPath, "plainly-wikipedia-preview.png"),
      fullPage: true,
    });

    const comparisonHtml = buildComparisonHtml(blocks);
    await writeFile(path.join(artifactsPath, "plainly-before-after-preview.html"), comparisonHtml, "utf8");
    const comparisonPage = await context.newPage();
    await comparisonPage.setContent(comparisonHtml, { waitUntil: "load" });
    await comparisonPage.screenshot({
      path: path.join(artifactsPath, "plainly-before-after-preview.png"),
      fullPage: true,
    });
    await comparisonPage.close();

    await writeFile(
      path.join(artifactsPath, "README.txt"),
      [
        "Plainly deterministic prototype preview",
        "",
        "This bundle demonstrates the real Chrome extension UI and DOM transformation path with deterministic fixture output.",
        "It does NOT claim to be a live OpenAI result.",
        "",
        "plainly-popup.png                  - extension setup UI",
        "plainly-wikipedia-preview.png      - Wikipedia after Plainly adjustment",
        "plainly-before-after-preview.png   - shareable before/after image",
        "plainly-before-after-preview.html  - standalone before/after page",
        "",
        "A separate plainly-live-demo-* artifact is produced when the live OpenAI integration succeeds.",
        "",
      ].join("\n"),
      "utf8",
    );
  } finally {
    await context.close();
    await rm(testRoot, { recursive: true, force: true });
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

async function waitForLevel(popup, expectedLevel) {
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return response.settings.level;
  })).toBe(expectedLevel);
}

async function decorateWikipediaPreview(page) {
  await page.addStyleTag({
    content: `
      body { margin: 0; background: #f8f9fa; color: #202122; font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #plainly-preview-banner { box-sizing: border-box; width: 100%; padding: 18px 28px; border-bottom: 1px solid #c8ccd1; background: white; font-weight: 650; }
      #plainly-preview-banner span { margin-left: 12px; color: #54595d; font-weight: 400; }
      #firstHeading, #mw-content-text { max-width: 920px; margin-left: auto; margin-right: auto; }
      #firstHeading { margin-top: 42px; margin-bottom: 0; padding-bottom: 10px; border-bottom: 1px solid #a2a9b1; font: 38px/1.2 Georgia, "Times New Roman", serif; }
      #mw-content-text { margin-top: 20px; margin-bottom: 64px; padding: 30px 38px; border: 1px solid #c8ccd1; border-radius: 8px; background: white; }
      #mw-content-text p { margin: 0 0 22px; }
      #mw-content-text h2 { margin-top: 30px; border-bottom: 1px solid #eaecf0; font: 26px/1.25 Georgia, "Times New Roman", serif; }
      #mw-content-text figure { display: none; }
      #plainly-indicator { bottom: 28px !important; right: 28px !important; }
    `,
  });
  await page.evaluate(({ level }) => {
    const banner = document.createElement("div");
    banner.id = "plainly-preview-banner";
    banner.textContent = "Plainly · Prototype preview";
    const detail = document.createElement("span");
    detail.textContent = `Wikipedia adjusted to Level ${level} · deterministic demonstration`;
    banner.append(detail);
    document.body.prepend(banner);
  }, { level: LEVEL });
}

function buildComparisonHtml(blocks) {
  const cards = blocks.map((block, index) => `
    <section class="pair">
      <div class="card source"><div class="eyebrow">Original · paragraph ${index + 1}</div><p>${escapeHtml(block.original)}</p></div>
      <div class="arrow" aria-hidden="true">→</div>
      <div class="card adjusted"><div class="eyebrow">Plainly · Level ${LEVEL}</div><p>${escapeHtml(block.adjusted)}</p></div>
    </section>
  `).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plainly prototype preview</title><style>
    * { box-sizing: border-box; } body { margin: 0; background: #f5f6f8; color: #17191c; font: 18px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width: min(1180px,calc(100% - 48px)); margin: 0 auto; padding: 58px 0 70px; } header { margin-bottom: 34px; }
    .brand { font-size: 15px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; } h1 { max-width: 820px; margin: 8px 0 10px; font-size: 46px; line-height: 1.08; }
    .meta, footer { color: #62676f; } .pair { display: grid; grid-template-columns: minmax(0,1fr) 46px minmax(0,1fr); align-items: stretch; margin: 22px 0; }
    .card { min-height: 210px; padding: 26px 28px; border: 1px solid #d8dbe1; border-radius: 14px; background: white; box-shadow: 0 8px 30px rgba(0,0,0,.04); }
    .adjusted { border-width: 2px; } .eyebrow { margin-bottom: 16px; font-size: 13px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: #62676f; }
    .card p { margin: 0; } .arrow { display: grid; place-items: center; font-size: 28px; color: #747981; } footer { margin-top: 32px; font-size: 14px; }
  </style></head><body><main><header><div class="brand">Plainly</div><h1>The same source, at the reader's level.</h1><div class="meta">Deterministic prototype preview · Photosynthesis · Level ${LEVEL}</div></header>${cards}<footer>This preview exercises the real Plainly extension and browser DOM path with deterministic fixture output. It is not presented as a live OpenAI response.</footer></main></body></html>`;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
