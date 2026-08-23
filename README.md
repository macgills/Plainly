# Plainly

**Browse the web at your reading level.**

Plainly is an early Chrome-extension prototype that automatically adjusts article prose to a persistent reading target. Wikipedia is the first supported article source; the architecture is intended to expand to general informational webpages.

## Reading targets

Plainly supports three teacher-facing options:

- **Oxford Reading Tree / Oxford Levels:** 1, 1+, 2–20
- **Fountas & Pinnell:** A–Z
- **DIBELS 8 — Maze:** Grade 2–8 + Beginning/Middle/End of Year + Maze score

For DIBELS Maze, Plainly classifies the score using the official DIBELS 8 Maze benchmark cut points for that grade and benchmark period. It then recommends a conservative language-access target and shows an approximate Lexile / F&P / Oxford crosswalk for teacher convenience.

DIBELS is an assessment system rather than a text-leveling scheme. Plainly's cross-scheme ranges are product recommendations, not official DIBELS, Lexile, Fountas & Pinnell, or Oxford conversions or certifications. A teacher can override the suggested target.

## Prototype scope

- Chrome / Chromium, Manifest V3
- English Wikipedia article extraction for the current prototype
- Persistent reading target and DIBELS Maze assessment inputs
- Automatic adjustment on navigation
- Original prose is hidden while adjusted text is loading
- Bring-your-own OpenAI API key, entered directly in the extension
- No local server required

## Try it

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `extension/` directory.
5. Open the Plainly toolbar popup.
6. Paste an OpenAI API key and choose **Save**.
7. Choose Oxford, F&P, or DIBELS Maze.
8. For DIBELS Maze, enter Grade 2–8, benchmark period, and Maze score.
9. Open or reload an English Wikipedia article.

The selected target and API key persist in the local Chrome profile. The extension sends article text directly to the OpenAI Responses API and never puts the API key into the webpage content script.

## Tests

```bash
npm install
npm test
```

The deterministic suite covers Oxford/F&P target selection, DIBELS Maze benchmark classification, crosswalk recommendation, browser persistence, seamless hiding, adjustment and failure fallback. The live GitHub Actions path uses repository secret `AI_SECRET` to run the shipped extension against the real OpenAI Responses API and emit sanitized demo artifacts.

## Architecture

```text
Article page
    ↓ content script @ document_start
identify readable prose + request public settings
    ↓
Plainly reading target
Oxford / F&P / DIBELS Maze assessment
    ↓
Manifest V3 service worker
    ↓
OpenAI Responses API
    ↓
adjusted blocks replace source prose progressively
```

## Current prototype compromises

- Wikipedia is currently the only extractor. General-web article extraction is the next major product expansion.
- Adjusted paragraphs currently replace inline links/citations inside that paragraph.
- DIBELS cross-scheme recommendations require teacher calibration before classroom claims are made.
- Direct user-key storage is a prototype convenience; a managed school deployment should put credentials behind a service.
