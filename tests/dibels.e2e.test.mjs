import { test as base, chromium, expect } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensionPath = path.resolve(here, "../extension");

const fakeOpenAIAdapter = `
export async function simplifyWithOpenAI({ payload }) {
  if (payload.scheme !== "dibelsMaze" || payload.level !== "4") throw new Error("Unexpected Maze target");
  if (payload.assessment?.period !== "middle" || payload.assessment?.score !== "14") throw new Error("Missing Maze assessment");
  return payload.blocks.map((block) => ({ id: block.id, text: "This is adjusted using the Maze-derived Plainly target." }));
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

test("DIBELS Maze grade, period and score produce a recommendation and persist", async ({ context, extensionId }) => {
  let popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("status").first()).not.toHaveText("Checking…");
  await popup.getByRole("textbox", { name: "OpenAI API key" }).fill("sk-test-dibels-browser-integration-key");
  await popup.getByRole("button", { name: "Save" }).click();
  await popup.getByLabel("Reading scheme").selectOption("dibelsMaze");
  await popup.getByLabel("Grade").selectOption("4");
  await popup.getByLabel("Assessment period").selectOption("middle");
  await popup.getByLabel("Maze score").fill("14");
  await popup.getByLabel("Maze score").blur();
  await expect(popup.getByText(/Strategic support/i)).toBeVisible();
  await expect(popup.getByText(/F&P/i)).toBeVisible();
  await expect.poll(() => popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    return `${response.settings.scheme}:${response.settings.level}:${response.settings.dibelsPeriod}:${response.settings.dibelsMazeScore}`;
  })).toBe("dibelsMaze:4:middle:14");
  await popup.close();

  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel("Reading scheme")).toHaveValue("dibelsMaze");
  await expect(popup.getByLabel("Grade")).toHaveValue("4");
  await expect(popup.getByLabel("Assessment period")).toHaveValue("middle");
  await expect(popup.getByLabel("Maze score")).toHaveValue("14");
  await expect(popup.getByText(/Strategic support/i)).toBeVisible();
});
