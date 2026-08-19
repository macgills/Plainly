import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assembleSafariExtension,
  bundleSafariBackground,
  toSafariManifest,
} from "../tools/safari-manifest.mjs";

test("converts the Chrome module service worker to a non-persistent Safari background page", () => {
  const chromeManifest = {
    manifest_version: 3,
    background: {
      service_worker: "background.js",
      type: "module",
    },
  };

  const safariManifest = toSafariManifest(chromeManifest);

  assert.deepEqual(safariManifest.background, {
    scripts: ["background-safari.js"],
    persistent: false,
  });
  assert.deepEqual(chromeManifest.background, {
    service_worker: "background.js",
    type: "module",
  });
});

test("bundles the OpenAI adapter and Chrome background module into Safari classic background code", () => {
  const bundled = bundleSafariBackground(
    'export const VALUE = 1;\nexport async function simplifyWithOpenAI() { return VALUE; }\n',
    'import { simplifyWithOpenAI } from "./openai.js";\nconst result = simplifyWithOpenAI();\n',
  );

  assert.match(bundled, /const VALUE = 1/);
  assert.match(bundled, /async function simplifyWithOpenAI/);
  assert.match(bundled, /const result = simplifyWithOpenAI/);
  assert.doesNotMatch(bundled, /^\s*(?:import|export)\b/m);
});

test("assembles a Safari extension without dropping the generated KMP runtime", async () => {
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
    await writeFile(
      path.join(source, "openai.js"),
      'export async function simplifyWithOpenAI() { return []; }\n',
      "utf8",
    );
    await writeFile(
      path.join(source, "background.js"),
      'import { simplifyWithOpenAI } from "./openai.js";\nvoid simplifyWithOpenAI;\n',
      "utf8",
    );
    await writeFile(path.join(source, "generated/plainly-core.js"), "// kmp\n", "utf8");

    await assembleSafariExtension(source, target);

    const manifest = JSON.parse(await readFile(path.join(target, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.background, {
      scripts: ["background-safari.js"],
      persistent: false,
    });
    const safariBackground = await readFile(path.join(target, "background-safari.js"), "utf8");
    assert.match(safariBackground, /async function simplifyWithOpenAI/);
    assert.doesNotMatch(safariBackground, /^\s*(?:import|export)\b/m);
    assert.equal(await readFile(path.join(target, "generated/plainly-core.js"), "utf8"), "// kmp\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
