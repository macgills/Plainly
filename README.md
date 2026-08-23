# Plainly

**Browse Wikipedia at a reading target that suits the reader.**

Plainly is an early browser-extension prototype that adjusts Wikipedia prose while keeping the page recognisably Wikipedia. It changes the language, not the browsing experience, and keeps the source text available as the authority.

## Reading targets

Plainly's reading-target policy lives in the Kotlin Multiplatform core and is shared by Chrome, Safari and native consumers.

- **Oxford Reading Tree** — levels 1, 1+, and 2–20
- **Fountas & Pinnell** — levels A–Z
- **DIBELS 8 Maze** — Grade 2–8 plus benchmark period and an optional Maze score

The default target is **Oxford 8**.

DIBELS Maze is a comprehension assessment, not a text-leveling scheme. When a score is entered, Plainly classifies it against the selected DIBELS 8 grade/benchmark-period cut points and derives a conservative language-access target. The displayed Lexile, F&P and Oxford ranges are approximate Plainly crosswalks, not official conversions or certifications.

## Prototype scope

- Chrome / Chromium, Manifest V3
- Safari Web Extension packaging for iPad
- English Wikipedia only
- Persistent reading target
- Automatic adjustment on navigation
- Original prose is hidden while the first adjusted paragraph is pending, so difficult text does not flash first
- Progressive adjustment after the first useful paragraph
- Bring-your-own OpenAI API key, entered directly in the extension
- No local server required

## Try it in Chrome

1. Build the KMP browser bundle:

   ```bash
   gradle -p core jsBrowserProductionWebpack
   mkdir -p extension/generated
   cp core/build/kotlin-webpack/js/productionExecutable/plainly-core.js extension/generated/plainly-core.js
   ```

2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `extension/` directory.
5. Open the Plainly toolbar popup.
6. Paste an OpenAI API key and choose **Save**.
7. Choose a reading scheme and target.
8. Open or reload an English Wikipedia article.

The selected target and API key persist in the local browser profile. The extension sends article text directly to the OpenAI Responses API and never puts the API key into the Wikipedia content script.

### Prototype key safety

The API key is stored in `chrome.storage.local`. Plainly restricts that storage to trusted extension contexts so the Wikipedia content script cannot read it, and the popup never displays a saved key back to the user.

This is still a prototype BYOK design, not a production secret-management strategy. Use a dedicated project key with a sensible spend limit; do not put a shared school or organisation-wide secret into a distributed extension.

## Architecture

```text
Wikipedia page
    ↓ content script @ document_start
hide candidate prose + resolve target through PlainlyCoreJs
    ↓ stable KMP block identities + runtime message
Manifest V3 service worker
    ↓ reads user key from trusted extension storage
OpenAI Responses API
    ↓
KMP session reconciles + fidelity-checks adjusted blocks
    ↓
adjusted prose replaces source prose progressively
```

The reusable `core/` module contains no browser APIs, DOM selectors, Wikipedia knowledge, provider code, API keys or UI. It owns:

- Oxford/F&P/DIBELS target definitions and validation
- DIBELS Maze benchmark classification and Plainly access recommendations
- target-specific model guidance
- source normalization and stable block identities
- viewport-first batching and response reconciliation
- provider-independent fidelity checks
- adjustment state/events

The Chrome and Safari extension layers remain thin adapters for DOM access, storage and provider transport.

## Tests

The main CI path builds the production KMP browser bundle, then uses that exact artifact in the browser tests and Safari package.

```bash
gradle -p core jvmTest jsNodeTest compileCommonMainKotlinMetadata jsBrowserProductionWebpack
npm install
npm test
```

Coverage includes:

- complete Oxford, F&P and DIBELS target ranges
- DIBELS benchmark boundaries and access recommendations
- stable block identity and duplicate source addressing
- numeric-fact preservation/rejection
- viewport-first progressive batching
- provider failure and missing-response handling
- KMP target data crossing the browser/OpenAI boundary
- no flash of original-complexity prose
- Oxford/F&P target persistence across navigation
- DIBELS recommendation display and persistence
- fail-open/no-key behavior
- popup API-key storage behavior
- Safari-compatible extension assembly

### Preview and live evaluation

Every green deterministic CI run publishes a `plainly-prototype-preview-*` artifact containing screenshots and the assembled extension.

The non-blocking live OpenAI job uses KMP-resolved reading targets for both the shipped-extension test and the teacher evaluation pack. The evaluation currently samples **Oxford 8**, **F&P M**, and **DIBELS Grade 4 / middle-of-year / Maze 14**, recording mechanical fidelity warnings for teacher review rather than treating model fluency as correctness.

Live artifacts contain transformed text, screenshots and latency metadata but no API key, browser profile, traces or request headers.

Run the live paths locally after building/copying `extension/generated/plainly-core.js`:

```bash
AI_SECRET="..." npm run test:live:api
AI_SECRET="..." npm run test:live
AI_SECRET="..." npm run eval:live
```

## Safari / iPad

CI packages the same extension sources as a Safari Web Extension, links the KMP iOS simulator framework, builds the host app, installs it on an iPad simulator and launches it. The final Safari-in-browser interaction still needs a signed real-device acceptance pass because extension enablement and website permissions cannot be fully automated in Safari.

See [`docs/ipad-acceptance.md`](docs/ipad-acceptance.md).

## Current prototype compromises

- Adjusted paragraphs currently replace inline links/citations inside that paragraph. Preserving semantic inline anchors while rewriting text is the next important DOM problem.
- Direct user-key storage is intentionally a prototype convenience; a managed school deployment should move credentials behind a service.
- DIBELS-to-language-target and cross-scheme mappings are explicit product approximations, not official conversions.
- There are no accounts, analytics, automatic reading assessment, arbitrary-site support, or school deployment features.
- Failure restores visibility of the original paragraph rather than blocking access to the source.
