import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { once } from "node:events";
import { createPlainlyServer } from "../server/plainly-server.mjs";

const servers = new Set();
afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => server.close(resolve))));
  servers.clear();
});

test("POST /simplify validates, transforms, and caches blocks over real HTTP", async () => {
  let calls = 0;
  const server = createPlainlyServer({
    logger: { error() {} },
    simplify: async ({ blocks }) => {
      calls += 1;
      return blocks.map((block) => ({ id: block.id, text: `Easy: ${block.text}` }));
    },
  });
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  const request = {
    level: 2,
    title: "Photosynthesis",
    blocks: [{ id: "intro", text: "Plants convert light energy into chemical energy." }],
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/simplify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      blocks: [{ id: "intro", text: "Easy: Plants convert light energy into chemical energy." }],
    });
  }

  assert.equal(calls, 1, "second identical request should be served from cache");
});

test("POST /simplify rejects invalid reading levels", async () => {
  const server = createPlainlyServer({ simplify: async () => [], logger: { error() {} } });
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/simplify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ level: 9, blocks: [{ id: "a", text: "text" }] }),
  });

  assert.equal(response.status, 400);
});
