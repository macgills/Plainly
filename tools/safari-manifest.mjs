import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function toSafariManifest(manifest) {
  const result = structuredClone(manifest);
  const background = result.background;

  if (background?.service_worker) {
    const { service_worker: serviceWorker, ...rest } = background;
    result.background = {
      ...rest,
      scripts: [serviceWorker],
    };
  }

  return result;
}

export async function assembleSafariExtension(sourcePath, targetPath) {
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, { recursive: true });

  const manifestPath = path.join(targetPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const safariManifest = toSafariManifest(manifest);
  await writeFile(manifestPath, `${JSON.stringify(safariManifest, null, 2)}\n`, "utf8");

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
