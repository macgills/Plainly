import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleSafariExtension, toSafariManifest } from "../tools/safari-manifest.mjs";

test("converts the Chrome module service worker to Safari module background scripts", () => {
  const chromeManifest = {
    manifest_version: 3,
    background: {
      service_worker: "background.js",
      type: "module",
    },
  };

  const safariManifest = toSafariManifest(chromeManifest);

  assert.deepEqual(safariManifest.background, {
    scripts: ["background.js"],
    type: "module",
  });
  assert.deepEqual(chromeManifest.background, {
    service_worker: "background.js",
    type: "module",
  });
});

test("assembles a Safari extension without dropping generated runtime files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "plainly-safari-manifest-"));
  const source = path.join(root, "extension");
  const target = path.join(root, "safari-extension");

  try {
    await mkdir(path.join(source, "generated"), { recursive: true });
    await writeFile(path.join(source, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      name: "Plainly",
      version: "0.3.0",
      background: {
        service_worker: "background.js",
        type: "module",
      },
    }), "utf8");
    await writeFile(path.join(source, "background.js"), "export {};\n", "utf8");
    await writeFile(path.join(source, "generated/plainly-core.js"), "// kmp\n", "utf8");

    await assembleSafariExtension(source, target);

    const manifest = JSON.parse(await readFile(path.join(target, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.background, {
      scripts: ["background.js"],
      type: "module",
    });
    assert.equal(await readFile(path.join(target, "generated/plainly-core.js"), "utf8"), "// kmp\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
