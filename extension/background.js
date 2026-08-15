const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PLAINLY_SIMPLIFY") return false;

  void simplify(message.payload)
    .then((blocks) => sendResponse({ ok: true, blocks }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
});

async function simplify(payload) {
  const { apiBaseUrl = DEFAULT_API_BASE_URL } = await chrome.storage.local.get({ apiBaseUrl: DEFAULT_API_BASE_URL });
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/simplify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`Plainly API returned ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.blocks)) throw new Error("Plainly API returned an invalid response");
  return body.blocks;
}
