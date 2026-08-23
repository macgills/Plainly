import { test as base, chromium, expect } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensionPath = path.resolve(here, "../extension");

const fakeOpenAIAdapter = `
export async function simplifyWithOpenAI({ payload }) {
  if (payload.scheme !== "dibels8" || payload.level !== "4") throw new Error("Unexpected DIBELS target");
  return payload.blocks.map((block) => ({ id: block.id, text: "This is adjusted for the selected DIBELS grade target." }));
}
`;

const test = base.extend({
  context: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), "plainly-dibels-"));
    const extensionPath = path.join(root, "extension");
    await cp(sourceExtensionPath, extensionPath, { recursive: true });
    await writeFile(path.join(extensionPath, "openai.js"), fakeOpenAIAdapter, "utf8");
    const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    try { await use(context); } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
});

test("DIBELS Grade 4 can be selected and persists", async ({ context, extensionId }) => {
  let popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("status")).not.toHaveText("Checking…");
  await popup.getByRole("textbox", { name: "OpenAI API key" }).fill("sk-test-dibels-browser-integration-key");
  await popup.getByRole("button", { name: "Save" }).click();
  await popup.getByLabel("Reading scheme").selectOption("dibels8");
  await popup.getByLabel("Level").selectOption("4");
  await expect(popup.getByText(/assessment system, not a text-leveling scheme/i)).toBeVisible();
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return `${response.settings.scheme}:${response.settings.level}`;
  })).toBe("dibels8:4");
  await popup.close();

  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel("Reading scheme")).toHaveValue("dibels8");
  await expect(popup.getByLabel("Level")).toHaveValue("4");
});
