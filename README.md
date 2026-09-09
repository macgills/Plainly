# Plainly

**Browse Wikipedia at a reading target that suits the reader.**

Plainly is an early browser-extension prototype that adjusts English Wikipedia prose while keeping the original text available. It supports **Oxford Reading Tree**, **Fountas & Pinnell**, and **DIBELS 8 Maze** targets. The default is **Oxford 8**.

You do not need to be a developer to try it locally. The sections below are deliberately written as copy/paste instructions.

## What you need

### For Chrome or Chromium

You need a Windows, macOS, or Linux computer with:

- **Git** — https://git-scm.com/downloads
- **Node.js 20 or newer** — https://nodejs.org/
- **Java 17 or newer** — https://adoptium.net/
- **Gradle 9.5 or newer** — https://gradle.org/install/
- **Google Chrome** or another Chromium browser

After installing them, open Terminal on macOS/Linux or PowerShell on Windows and check:

```text
git --version
node --version
java -version
gradle --version
```

If each command prints a version number, you are ready.

### For the iPad simulator

You need an **Apple Silicon Mac** with all of the above plus:

- **Xcode** from the Mac App Store
- an iOS Simulator runtime installed in **Xcode → Settings → Components**
- **Homebrew** — https://brew.sh/

The local iPad command uses the same automated Safari test that runs in CI. It builds Plainly, installs it in an iPad simulator, enables the Safari extension, grants its website permissions, enters your API key, opens Wikipedia, and proves that adjusted text appears.

## 1. Download Plainly

Open Terminal or PowerShell and run:

```bash
git clone https://github.com/macgills/Plainly.git
cd Plainly
```

Everything below should be run from that `Plainly` folder.

## 2. Try Plainly in Chrome

Build the extension:

```bash
npm run build
```

When it finishes, it should say:

```text
Plainly browser extension built in extension/
```

Then:

1. Open Chrome.
2. Enter `chrome://extensions` in the address bar.
3. Turn on **Developer mode** in the top-right corner.
4. Choose **Load unpacked**.
5. Select the `extension` folder inside the Plainly folder you downloaded.
6. Pin/open the **Plainly** extension from Chrome's extensions menu.
7. Paste an OpenAI API key and choose **Save**.
8. Choose a reading scheme and target.
9. Open or reload any article on **en.wikipedia.org**.

Plainly should replace suitable article paragraphs with adjusted text. Use the **Plainly** button on the page to switch between the adjusted and original text.

If you change the source code later, run `npm run build` again and press **Reload** on Plainly's card in `chrome://extensions`.

## 3. Try Plainly on an iPad simulator

This is the easiest Safari/iPad route because it is automated.

First create an OpenAI API key. Then, from the Plainly folder on your Mac, run:

```bash
AI_SECRET="sk-your-key-here" npm run ipad
```

The command builds the shared core and Safari extension, boots an iPad simulator, installs Plainly, enables its Safari extension, grants Wikipedia permission, enters your API key, opens a Wikipedia article and verifies that adjusted text appears.

## Reading targets

The shared Kotlin Multiplatform core owns the reading-target policy used by browser and future native clients:

- **Oxford Reading Tree / Oxford Levels**
- **Fountas & Pinnell**
- **DIBELS 8 Maze** assessment-driven targets

DIBELS Maze is an assessment rather than a text-leveling scheme. Plainly uses the benchmark result as context for a conservative language-access recommendation. Any Lexile, F&P or Oxford crosswalk shown by Plainly is an approximate product aid, not an official conversion or certification.

## Architecture

```text
Article page
    ↓
Chrome / Safari Web Extension adapter
    ↓
Plainly Kotlin Multiplatform core
    ↓
reading target + batching + fidelity checks
    ↓
OpenAI Responses API (prototype provider)
    ↓
adjusted text is reconciled back into the page
```

The shared core deliberately contains no Chrome APIs, Safari APIs, DOM selectors, API keys or provider-specific networking. See `core/README.md` for its boundary and test commands.

## Current prototype compromises

- Wikipedia is still the principal supported page extractor; general-web article extraction is the next major product expansion.
- Adjusted paragraphs do not yet preserve every inline link/citation perfectly.
- Bring-your-own API key is appropriate for prototyping, not a managed school deployment.
- The DIBELS-to-Lexile/F&P/Oxford crosswalk should be calibrated with teacher review before classroom claims are made.
