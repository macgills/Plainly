# Plainly

**Browse Wikipedia at your reading level.**

Plainly is an early Chrome-extension prototype that automatically adjusts Wikipedia prose to a persistent reading level. The page stays recognisably Wikipedia: Plainly changes the prose, not the browsing experience.

## Prototype scope

- Chrome / Chromium, Manifest V3
- English Wikipedia only
- Persistent Levels 1–3
- Automatic adjustment on navigation
- Original prose is hidden while the adjusted version is loading, so difficult text does not flash first
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

The integration suite launches Playwright's Chromium with the actual Manifest V3 extension loaded. It verifies:

- original Wikipedia prose stays hidden while the first OpenAI response is pending
- adjusted prose is revealed in place
- no API key means Wikipedia remains immediately readable
- the stored key is sent as the OpenAI bearer token without being displayed back in the popup
- adjusted mode and reading level persist across navigation
- OpenAI failure restores the original prose instead of leaving content blocked
- popup key save/remove and reading-level persistence work through real extension storage

A fast Node integration test also exercises the OpenAI HTTP boundary against a fake Responses endpoint. Tests never call the real OpenAI API or require a real key.

## Architecture

```text
Wikipedia page
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

- Adjusted paragraphs currently replace inline links/citations inside that paragraph. Preserving semantic inline anchors while rewriting text is the next important DOM problem.
- Direct user-key storage is intentionally a prototype convenience; a managed school deployment should move credentials behind a service.
- There are no accounts, analytics, automatic level assessment, arbitrary-site support, or school deployment features.
- Failure restores visibility of the original paragraph rather than blocking access to the source.
