# Plainly iPad acceptance

This is the first test that crosses the boundary CI cannot prove: Plainly enabled inside Safari and transforming a real Wikipedia browsing session on an iPad.

## Preconditions

- Install a signed Plainly build on the iPad (TestFlight is the intended prototype route).
- In Safari settings, enable the Plainly extension and grant it access to Wikipedia.
- Open the Plainly extension control.
- Save a disposable prototype OpenAI API key on the device.
- Turn Plainly on and select **Oxford 8**.

> The prototype currently stores the provider key in extension storage on the device. This is acceptable only for prototype testing; production/school distribution must move provider credentials behind a Plainly backend.

## Primary journey

Start from a new Safari tab and browse to the English Wikipedia article for **Roman Empire**.

Pass only if all of the following are true:

1. The page title, images, infobox, links, citations and normal Wikipedia navigation remain intact.
2. Original-complexity prose does **not** visibly flash before adjusted prose appears.
3. The first useful paragraph becomes readable before the rest of the article finishes adjusting.
4. Later paragraphs continue to adjust progressively rather than blocking the whole article.
5. Plainly visibly indicates that adjusted text is being shown and names the selected target.
6. Follow at least five normal Wikipedia article links. Adjusted mode and Oxford 8 must persist without reopening Plainly.
7. Switch to **Original** (or turn Plainly off) and confirm the source prose remains accessible.
8. Re-enable Plainly and confirm browsing resumes in adjusted mode.

## Reading-target check

On the same article, exercise all three target families:

- Oxford: compare a low, middle and high target, for example 5, 8 and 16.
- Fountas & Pinnell: compare representative targets, for example H, M and V.
- DIBELS Maze: choose Grade 4 / middle of year, first without a score and then with a score of 14. Confirm the scored form reports **Below Benchmark** and recommends approximately **Grade 3** language access.

Pass only if:

- easier and harder targets are meaningfully different in sentence structure and vocabulary;
- names, dates, numbers and important technical terms remain factually intact;
- uncertainty is preserved (`may`, `possibly`, `estimated`, `believed`, and similar wording must not silently become certainty);
- adjustment does not invent examples, explanations or claims that are absent from the source;
- difficult but necessary concepts are clarified rather than simply deleted;
- DIBELS and cross-scheme recommendations are clearly presented as Plainly approximations rather than official conversions.

Record any questionable rewrite verbatim as:

```text
Article:
Reading target:
Original:
Adjusted:
Why it is questionable:
```

Those examples belong in the teacher evaluation corpus before prompt/model tuning.

## Failure behaviour

Run one failure test by temporarily removing the saved API key, then loading a fresh Wikipedia article.

Pass only if:

- Plainly does not leave prose permanently hidden or the page stuck behind placeholders;
- the original Wikipedia prose becomes available again;
- the failure is visible but unobtrusive;
- restoring the key and reloading returns to adjusted browsing.

## Acceptance evidence

For the first successful iPad run, capture:

- iPadOS version and iPad model;
- Plainly build/commit SHA;
- selected reading scheme and target;
- DIBELS grade/period/score where applicable;
- first article tested;
- approximate time until the first adjusted paragraph is readable;
- whether any original prose flashed;
- five linked articles visited;
- any fidelity problems using the template above.

## Prototype exit criterion

The prototype clears the iPad milestone when a teacher can browse Wikipedia for several minutes without feeling like they are operating an AI tool: pages simply appear at the chosen reading target, source structure remains familiar, failures recover safely, and questionable rewrites can be traced back to the original text.
