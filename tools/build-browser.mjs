import { cp, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const gradle = process.platform === "win32" ? "gradle.bat" : "gradle";
const result = spawnSync(gradle, [
  "-p",
  "core",
  "--no-daemon",
  "jsBrowserProductionWebpack",
], { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  console.error("\nPlainly needs Gradle on PATH. Install Gradle 9.5+ and try again.");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

await mkdir("extension/generated", { recursive: true });
await cp(
  "core/build/kotlin-webpack/js/productionExecutable/plainly-core.js",
  "extension/generated/plainly-core.js",
);

console.log("\nPlainly browser extension built in extension/");
