# Plainly Extension Core

A platform-neutral Kotlin Multiplatform engine for reading-level browser extensions.

This module deliberately contains **no Chrome APIs, Safari APIs, DOM selectors, Wikipedia knowledge, OpenAI code, API keys, or UI**. It models the reusable part of an extension that adjusts source text while preserving the original page as the authority.

## Targets

- **Kotlin/JS** — shared engine for Chrome and Safari Web Extensions
- **JVM** — fast local/CI tests and future server reuse
- **iOS arm64 + simulator arm64** — optional native host-app reuse when Plainly is packaged for iPad

## Core boundary

```text
Browser / native host
  ├─ discovers page blocks
  ├─ stores user settings
  ├─ calls a model/backend
  └─ applies DOM/native UI changes
          │
          ▼
Plainly Extension Core
  ├─ normalizes source text
  ├─ creates stable block identities
  ├─ prioritizes the first visible block
  ├─ plans progressive batches
  ├─ reconciles provider responses
  ├─ performs provider-independent fidelity checks
  └─ emits Pending / Ready / Rejected / Failed / Complete
```

`AdjustmentProvider` is the only model-facing port. A host can implement it with OpenAI, a school backend, another model provider, or a deterministic test double.

## Why stable source keys matter

DOM indexes are fragile. The core derives a deterministic fingerprint from normalized source text plus a duplicate occurrence number. Hosts keep their own mapping from a `BlockKey` back to the live DOM node. That lets the transformation layer stay independent of Wikipedia or any particular page structure.

## Failure semantics

The engine never instructs a host to discard source content. `Rejected` and `Failed` events are explicit signals for the host to reveal/retain the original block. The default fidelity guard currently rejects transformations that drop numeric facts; more rules can be added without changing browser adapters.

## Build and test

With Gradle 9.5+ available:

```bash
gradle -p core jvmTest jsNodeTest compileKotlinJs compileCommonMainKotlinMetadata
```

CI runs the JVM and JS tests on Linux. iOS binaries are intentionally left to an eventual macOS packaging workflow.

## Next integration step

The current Chrome prototype should become a thin adapter:

```text
content script -> collect DOM blocks -> PlainlyCore JS -> runtime/provider -> events -> DOM
```

Safari gets a separate thin adapter around the same generated JS core. The iPad host app can optionally consume the `PlainlyCore` framework for shared settings/policy code, but the Safari Web Extension itself still runs web-extension JavaScript.
