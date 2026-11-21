# No-key rewriting evaluation

This is an **offline, provider-neutral evaluation harness**, not a rewriting engine. It requires **no OpenAI key**, makes **no network calls**, and does not prove that any model works yet.

## Candidate output format

Run a candidate model separately on every passage in `evaluation/cases.json`. Save the real outputs (never invented example results) in a JSON file:

```json
{
  "provider": "actual-provider-and-model-name",
  "device": "actual-tested-device-and-browser",
  "target": "Oxford 8",
  "modelDownloadMb": null,
  "peakMemoryMb": null,
  "outputs": [
    {"id": "history-hastings", "text": "ACTUAL MODEL OUTPUT", "latencyMs": null}
  ]
}
```

Include one output for **each** case. Run:

```sh
node evaluation/evaluate-no-key.mjs candidate.json report.json
```

The report flags removed/added numbers, missing required terms and uncertainty markers, missing output, and unchanged text. These are conservative **review warnings**, not proof that a rewrite is wrong. The report always sets `approvedForRelease: false`, even if all mechanical checks pass.

## Required manual evaluation

For each passage and each target level, a teacher or qualified reviewer should assess factual accuracy, missing/added claims, uncertainty, accessibility of vocabulary and sentence structure, and whether the target is appropriate. Record failures and judge actual output, not model marketing claims.

Measure cold start, model download, time to first adjusted paragraph, sustained latency, memory use, offline operation, privacy, and behavior on a representative Intel 8 GB Mac and Chromebook-class device. Do not assume a browser model works on those devices without testing.

If on-device models fail quality or performance, compare a centrally funded hosted approach with explicit cost, data minimization, child privacy, abuse prevention, and sustainability assumptions. End users must never be required to supply a paid API key.

The existing `evaluation/run-live.mjs` uses OpenAI and is **legacy prototype evaluation**, not a no-key candidate.
