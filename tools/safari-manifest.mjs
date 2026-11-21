import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFARI_BACKGROUND = "background-safari.js";

export function toSafariManifest(manifest) {
  const result = structuredClone(manifest);

  if (result.background?.service_worker) {
    result.background = {
      service_worker: SAFARI_BACKGROUND,
    };
  }

  return result;
}

export function bundleSafariBackground(openAiModule, backgroundModule, providerModule = "") {
  const openAiClassic = openAiModule
    .replace(/^export\s+const\s+/gm, "const ")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ");

  const providerClassic = providerModule
    .replace(/^import\s+\{\s*simplifyWithOpenAI\s*\}\s+from\s+["']\.\/openai\.js["'];\s*/m, "")
    .replace(/^export\s+const\s+/gm, "const ")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ");

  const backgroundClassic = backgroundModule
    .replace(/^import\s+\{\s*simplifyWithOpenAI\s*\}\s+from\s+["']\.\/openai\.js["'];\s*/m, "")
    .replace(/^import\s+\{[^}]+\}\s+from\s+["']\.\/rewriting-provider\.js["'];\s*/m, "");

  const bundled = [openAiClassic.trim(), providerClassic.trim(), backgroundClassic.trim()]
    .filter(Boolean).join("\n\n") + "\n";
  if (/^\s*(?:import|export)\b/m.test(bundled)) {
    throw new Error("Safari background bundle still contains ES module syntax");
  }
  return bundled;
}

export async function assembleSafariExtension(sourcePath, targetPath) {
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, { recursive: true });

  const manifestPath = path.join(targetPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const safariManifest = toSafariManifest(manifest);
  await writeFile(manifestPath, `${JSON.stringify(safariManifest, null, 2)}\n`, "utf8");

  const openAiModule = await readFile(path.join(sourcePath, "openai.js"), "utf8");
  const backgroundModule = await readFile(path.join(sourcePath, "background.js"), "utf8");
  const providerModule = await readFile(path.join(sourcePath, "rewriting-provider.js"), "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  await writeFile(
    path.join(targetPath, SAFARI_BACKGROUND),
    bundleSafariBackground(openAiModule, backgroundModule, providerModule),
    "utf8",
  );

  return safariManifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  const sourcePath = path.resolve(process.argv[2] ?? "extension");
  const targetPath = path.resolve(process.argv[3] ?? "build/safari-extension");
  const manifest = await assembleSafariExtension(sourcePath, targetPath);
  console.log(`Safari extension assembled at ${targetPath}`);
  console.log(`Background: ${JSON.stringify(manifest.background)}`);
}
