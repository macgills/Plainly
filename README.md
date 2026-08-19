# Plainly

**Browse Wikipedia at your reading level.**

Plainly is an early Chrome-extension prototype that automatically adjusts Wikipedia prose to a persistent reading level. The page stays recognisably Wikipedia: Plainly changes the prose, not the browsing experience.

## Prototype scope

- Chrome / Chromium, Manifest V3
- English Wikipedia only
- Persistent Levels 1–3
- Automatic adjustment on navigation
- Original prose is hidden while the adjusted version is loading, so difficult text does not flash first
- Inline Wikipedia links and citations survive adjusted/original mode changes
- Bring-your-own OpenAI API key, entered directly in the extension
- No local server required

## Try it

1. Clone this repository and check out the prototype branch.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `extension/` directory.
5. Open the Plainly toolbar popup.
6. Paste an OpenAI API key and choose **Save**.
7. Open or reload an English Wikipedia article.

Plainly defaults to **on, Level 2**. The selected level and API key persist in the local Chrome profile. The extension sends article text directly to the OpenAI Responses API and never puts the API key into the Wikipedia content script.

### Prototype key safety

The API key is stored in `chrome.storage.local`. Plainly restricts that storage to trusted extension contexts so the Wikipedia content script cannot read it, and the popup never displays a saved key back to the user.

This is still a prototype BYOK design, not a production secret-management strategy. Use a dedicated project key with a sensible spend limit; do not put a shared school or organisation-wide secret into a distributed extension.

## Tests

Install the test dependency and run:

```bash
npm install
npm test
```

The deterministic integration suite launches Playwright's Chromium with the actual Manifest V3 extension loaded. It verifies:

- original Wikipedia prose stays hidden while the first simplification response is pending
- adjusted prose is revealed in place
- no API key means Wikipedia remains immediately readable
- adjusted mode and reading level persist across navigation
- Wikipedia links remain real anchors in adjusted mode and Original mode
- citation markers are excluded from model/fidelity prose and restored into adjusted DOM
- simplification failure restores the original prose instead of leaving content blocked
- popup key save/remove and reading-level persistence work through real extension storage

A fast Node integration test separately exercises the production OpenAI HTTP contract against a fake Responses endpoint, including bearer authentication, protected linked terms and strict structured-output mapping. Deterministic tests never call the real OpenAI API or require a real key.

### Prototype preview artifact

Every green deterministic CI run also publishes a `plainly-prototype-preview-*` artifact. It contains the real extension UI and browser DOM path with deterministic simplification output, clearly labelled as a prototype preview rather than a live model response:

- `plainly-popup.png` — extension setup UI
- `plainly-wikipedia-preview.png` — Wikipedia after Plainly adjustment
- `plainly-before-after-preview.png` — shareable before/after image
- `plainly-before-after-preview.html` — standalone before/after page
- the unpacked production `extension/` directory

### Live OpenAI integration and demo artifacts

GitHub Actions also runs a non-blocking live end-to-end check when the repository secret `AI_SECRET` is available. It first probes the production OpenAI adapter so credential, quota, model, or schema problems fail quickly before Chromium is downloaded. When that probe succeeds, the live test:

1. launches Chromium with the shipped extension;
2. enters `AI_SECRET` through the real popup UI;
3. opens a Wikipedia fixture on the real Wikipedia origin;
4. allows the extension service worker to call the real OpenAI Responses API;
5. verifies the adjusted prose is written back into the page; and
6. publishes a `plainly-live-demo-*` workflow artifact.

The live artifact contains:

- `plainly-live-wikipedia.png` — the transformed Wikipedia view
- `plainly-before-after.png` — a shareable side-by-side comparison
- `plainly-before-after.html` — a standalone comparison page
- `plainly-live-result.json` — sanitized transformed text and latency metadata
- the unpacked `extension/` directory so the build can be tried manually

The live workflow intentionally disables Playwright traces and does not save the browser profile. The API key and request headers are not included in the artifact. Live API availability does not gate deterministic PR CI.

Run the same live test locally with:

```bash
AI_SECRET="..." npm run test:live:api
AI_SECRET="..." npm run test:live
```

## Architecture

```text
Wikipedia page
    ↓ content script @ document_start
hide candidate prose + request public settings
    ↓ extract prose without citation markers
KMP session: stable ids, batching, reconciliation, fidelity
    ↓ runtime message (no API key exposed)
Manifest V3 service worker
    ↓ reads user key from trusted extension storage
OpenAI Responses API
    ↓ adjusted text + protected linked terms
content script reattaches original anchors/citations
    ↓
adjusted blocks replace source prose progressively
```

## Current prototype compromises

- Linked source terms are protected during simplification; if a rewrite drops one, that block fails open to original prose rather than losing the link.
- Citations are preserved in source order but currently move to the end of the adjusted block; sentence-level citation placement is not reconstructed after a rewrite.
- Direct user-key storage is intentionally a prototype convenience; a managed school deployment should move credentials behind a service.
- There are no accounts, analytics, automatic level assessment, arbitrary-site support, or school deployment features.
- Failure restores visibility of the original paragraph rather than blocking access to the source.
