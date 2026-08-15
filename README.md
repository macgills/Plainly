# Plainly

**Browse Wikipedia at your reading level.**

Plainly is an early Chrome-extension prototype that automatically adjusts Wikipedia prose to a persistent reading level. The page stays recognisably Wikipedia: Plainly changes the prose, not the browsing experience.

## Prototype scope

- Chrome / Chromium, Manifest V3
- English Wikipedia only
- Persistent Levels 1–3
- Automatic adjustment on navigation
- Original prose is hidden while the adjusted version is loading, so difficult text does not flash first
- Local Node API backed by the OpenAI Responses API

## Run it

Requirements: Node 20+ and an OpenAI API key.

```bash
npm install
export OPENAI_API_KEY="..."
npm run dev:server
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` directory.

Open an English Wikipedia article. Plainly defaults to **on, Level 2**. Use the toolbar popup to change level or disable adjusted reading.

The prototype API runs at `http://127.0.0.1:8787`. Set `PLAINLY_MODEL` to override the default `gpt-5-mini` model.

## Tests

```bash
npm test
```

The integration suite launches Playwright's Chromium with the actual Manifest V3 extension loaded. It verifies the key UX invariant: original Wikipedia prose stays hidden while the first simplification request is pending, then adjusted prose is revealed in place. It also checks persistent mode across navigation, failure fallback, and popup storage.

Server integration tests exercise the real HTTP API boundary with an injected fake simplifier, including validation and cache behaviour. Tests never call OpenAI.

## Architecture

```text
Wikipedia page
    ↓ content script @ document_start
hide candidate prose + read persisted level
    ↓
Manifest V3 service worker
    ↓ POST /simplify
Plainly local API
    ↓
OpenAI Responses API
    ↓
adjusted blocks replace source prose progressively
```

## Current prototype compromises

- Adjusted paragraphs currently replace inline links/citations inside that paragraph. Preserving semantic inline anchors while rewriting text is the next important DOM problem.
- The backend cache is in-memory only.
- There are no accounts, analytics, automatic level assessment, arbitrary-site support, or school deployment features.
- Failure restores visibility of the original paragraph rather than blocking access to the source.
