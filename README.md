# Plainly

**Browse the web at your reading level.**

Plainly is an early Chrome-extension prototype that automatically adjusts article prose to a persistent reading target. Wikipedia is the first supported article source; the architecture is intended to expand to general informational webpages.

## Reading targets

Plainly currently supports three teacher-facing target systems:

- **Oxford Reading Tree / Oxford Levels:** 1, 1+, 2–20
- **Fountas & Pinnell:** A–Z
- **DIBELS 8th Edition:** grade-based language-access targets K–8

These are transformation targets, not official certifications of a webpage or reader. In particular, DIBELS is an assessment and benchmark system rather than a text-leveling scheme, so Plainly uses the selected DIBELS grade to guide language accessibility; it does not convert a DIBELS composite score directly into a certified text level.

A later score-assisted mode can accept a pupil's DIBELS grade, benchmark period and score and recommend a Plainly target. That recommendation should remain distinct from the official DIBELS benchmark/support classification.

## Prototype scope

- Chrome / Chromium, Manifest V3
- English Wikipedia article extraction for the current prototype
- Persistent reading scheme and target
- Automatic adjustment on navigation
- Original prose is hidden while the adjusted version is loading, so difficult source text does not flash first
- Bring-your-own OpenAI API key, entered directly in the extension
- No local server required

## Try it

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `extension/` directory.
5. Open the Plainly toolbar popup.
6. Paste an OpenAI API key and choose **Save**.
7. Choose a reading scheme and target level/grade.
8. Open or reload an English Wikipedia article.

The selected target and API key persist in the local Chrome profile. The extension sends article text directly to the OpenAI Responses API and never puts the API key into the webpage content script.

### Prototype key safety

The API key is stored in `chrome.storage.local`. Plainly restricts that storage to trusted extension contexts so the webpage content script cannot read it, and the popup never displays a saved key back to the user.

This is still a prototype BYOK design, not a production secret-management strategy. Use a dedicated project key with a sensible spend limit; a managed school deployment should put credentials behind a service.

## Tests

```bash
npm install
npm test
```

The deterministic integration suite launches Chromium with the actual Manifest V3 extension loaded. It covers Oxford, Fountas & Pinnell and DIBELS target selection/persistence, seamless hiding, adjustment and failure fallback.

A Node integration test separately exercises the production OpenAI HTTP contract against a fake Responses endpoint, including bearer authentication, strict structured-output mapping and scheme-specific prompt guidance. Deterministic tests never call the real OpenAI API or require a real key.

### Live OpenAI integration

GitHub Actions also runs a non-blocking live end-to-end check when repository secret `AI_SECRET` is available. It probes the production OpenAI adapter, then launches the shipped extension in Chromium and produces sanitized demo artifacts. The API key, browser profile and request headers are not included in those artifacts.

Run the same live test locally with:

```bash
AI_SECRET="..." npm run test:live:api
AI_SECRET="..." npm run test:live
```

## Architecture

```text
Article page
    ↓ content script @ document_start
hide candidate prose + request public settings
    ↓ runtime message (no API key exposed)
Manifest V3 service worker
    ↓ reads user key from trusted extension storage
OpenAI Responses API
    ↓
adjusted blocks replace source prose progressively
```

## Current prototype compromises

- Wikipedia is currently the only extractor. General-web article extraction is the next major product expansion.
- Adjusted paragraphs currently replace inline links/citations inside that paragraph. Preserving semantic anchors while rewriting text remains an important DOM problem.
- DIBELS score-to-target recommendation is not implemented yet; doing that responsibly requires grade, benchmark period and assessment context rather than treating a composite score as a text level.
- There are no accounts, analytics, automatic assessment, or school deployment features yet.
