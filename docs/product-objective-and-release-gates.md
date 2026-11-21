# Plainly — product objective and release gates

**Tagline:** The web, at your reading level.

## Non-negotiable product objective

Plainly is a Chrome/Edge browser extension that adapts the **main readable text** of ordinary web pages to a chosen reading target, while retaining factual meaning, images, headings, hyperlinks, and usable page layout. Readers can toggle the original. Navigation, forms, buttons, ads, and other controls are not rewritten.

Plainly must be free for children, parents, and teachers to use: **no API key, payment, or account required from end users**. Any centrally funded service must have an explicit, sustainable funding and privacy plan. Do not describe the current OpenAI bring-your-own-key prototype as meeting this requirement.

## Current verified state

- Chrome/Edge MV3 extension packaging and deterministic Chromium CI passed on run #148.
- A user loaded Plainly in Chrome on a MacBook; Wikipedia was detected and the Plainly indicator appeared.
- Rewriting did **not** complete because the user's OpenAI API account had no credits.
- Generic article extraction exists but has not been proven reliable across websites.
- Replacing paragraph `textContent` destroys inline hyperlinks/markup; preserving those is a release blocker.
- DIBELS 8 Maze is an assessment, not a text-level scale. Any crosswalks are approximations requiring validation.
- Earlier local FLAN-T5 small/base trials gave poor rewrite quality; prior Ollama/llama.cpp attempts on an Intel 8GB Mac failed. Do not treat these as validated solutions.

## Execution order and acceptance gates

### Gate 1 — Viable no-key rewriting

1. Establish a small, diverse benchmark of real article excerpts, with original facts, numbers, names, and links noted.
2. Evaluate candidate on-device/browser inference approaches on realistic MacBook/Chromebook-class hardware, including cold-start/download size, latency, memory, offline behavior, and text quality.
3. Check accuracy and reading-level suitability manually with an explicit rubric; deterministic tests alone do not validate quality.
4. If no on-device candidate passes, assess a centrally funded hosted provider with privacy, rate limiting, child safety, cost, and operational constraints. **Do not silently switch to a paid user-key requirement.**

**Pass:** A reader can load an ordinary article in Chrome and get a meaning-preserving rewrite without supplying an API key or paying. Document tested hardware, timings, and quality limitations.

### Gate 2 — General websites and page fidelity

- Detect main article/body text across a representative site fixture set; exclude controls, menus, comments, ads, and navigation.
- Preserve images, headings, links, citations, and interactive elements; support original/adjusted toggle without destructive DOM replacement.
- Fail open to original text on errors, and explain failures accessibly.

**Pass:** Browser integration tests on multiple non-Wikipedia site layouts and manual review.

### Gate 3 — Reading-target validity

- Verify Oxford and Fountas & Pinnell targets with reading specialists; qualify approximate crosswalks.
- Keep DIBELS-informed guidance explicitly distinct from official text levels.
- Check meaning, omissions, hallucinations, names, numbers, and readability across target levels.

**Pass:** Published evaluation rubric, representative results, and known limitations.

### Gate 4 — Chrome/Edge release

- Package installable Chrome/Edge extensions; test MacBook, Windows, and Chromebook-class devices.
- Check browser policies, permissions, privacy disclosure, reliability, and school deployment constraints.
- Safari/iPad is a later phase; Chrome on iPad does not support Chrome Web Store extensions.

## Next engineering action

Create a reproducible **no-key rewriting benchmark** and candidate evaluation harness, then use measured results to select the provider. Keep the provider abstraction from PR #7. Do not claim the product works or ask the user to buy credits before Gate 1 is met.
