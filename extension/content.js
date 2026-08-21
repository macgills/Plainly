(() => {
  const BLOCK_SELECTOR = [
    "#mw-content-text .mw-parser-output p",
    "#mw-content-text .mw-parser-output li",
  ].join(",");
  const EXCLUDED_ANCESTORS = [
    ".infobox",
    ".navbox",
    ".vertical-navbox",
    ".reflist",
    ".references",
    ".toc",
    "table",
    "style",
    "script",
  ].join(",");

  document.documentElement.classList.add("plainly-pending");
  void bootstrap();

  async function bootstrap() {
    const settingsResponse = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    const settings = settingsResponse?.settings;
    if (!settingsResponse?.ok || !settings?.enabled || !settings.hasApiKey) {
      leaveAdjustedMode();
      return;
    }

    const kmp = globalThis["plainly-extension-core"];
    if (!kmp?.PlainlyCoreJs) {
      console.warn("Plainly KMP core is unavailable; showing the original article.");
      leaveAdjustedMode();
      return;
    }

    document.documentElement.classList.add("plainly-enabled");
    await waitForArticle();

    const elements = collectReadableElements();
    if (elements.length === 0) {
      leaveAdjustedMode();
      return;
    }

    const title = document.querySelector("#firstHeading")?.textContent?.trim() ?? document.title;
    let session;
    try {
      session = kmp.PlainlyCoreJs.createSession(
        location.href,
        title,
        settings.level,
        elements.map((element) => element.textContent ?? ""),
        1,
        4,
      );
    } catch (error) {
      console.warn("Plainly could not initialize its KMP core; showing the original article.", error);
      leaveAdjustedMode();
      return;
    }

    const sourceBlocks = [...session.sourceBlocks()];
    if (sourceBlocks.length !== elements.length) {
      console.warn("Plainly core returned a different block count; showing the original article.");
      leaveAdjustedMode();
      return;
    }

    const blocks = sourceBlocks.map((source, index) => ({
      key: source.key,
      text: source.text,
      element: elements[index],
    }));
    const blocksByKey = new Map(blocks.map((block) => [block.key, block]));

    for (const block of blocks) {
      block.element.dataset.plainlyState = "loading";
      block.element.dataset.plainlyOriginal = block.text;
    }

    document.documentElement.classList.remove("plainly-pending");
    const indicator = addIndicator(settings.level);
    indicator.dataset.engine = "kmp";

    let firstBatch = true;
    while (!session.isComplete()) {
      const requested = [...session.nextBatch()];
      if (requested.length === 0) break;

      const domBatch = requested
        .map((source) => blocksByKey.get(source.key))
        .filter(Boolean);

      try {
        const response = await chrome.runtime.sendMessage({
          type: "PLAINLY_SIMPLIFY",
          payload: {
            level: settings.level,
            url: location.href,
            title,
            blocks: requested.map(({ key, text }) => ({ id: key, text })),
          },
        });

        if (!response?.ok) throw new Error(response?.error ?? "Plainly request failed");

        const decisions = [...session.accept(
          response.blocks.map((block) => block.id),
          response.blocks.map((block) => block.text),
        )];
        const allReady = applyDecisions(decisions, blocksByKey);

        if (firstBatch && !allReady) {
          revealUnfinishedBlocks(blocks);
          markIndicatorUnavailable(indicator);
          return;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        try {
          session.fail(reason);
        } catch {
          // The core may already have reconciled the active batch. The DOM still fails open below.
        }
        console.warn("Plainly could not adjust a block; restoring original text.", error);
        for (const block of domBatch) block.element.dataset.plainlyState = "error";

        if (firstBatch) {
          revealUnfinishedBlocks(blocks);
          markIndicatorUnavailable(indicator);
          return;
        }
      }

      firstBatch = false;
    }
  }

  function leaveAdjustedMode() {
    document.documentElement.classList.remove("plainly-pending", "plainly-enabled");
  }

  function waitForArticle() {
    const existing = document.querySelector("#mw-content-text .mw-parser-output");
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const article = document.querySelector("#mw-content-text .mw-parser-output");
        if (!article) return;
        observer.disconnect();
        resolve(article);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function collectReadableElements() {
    return [...document.querySelectorAll(BLOCK_SELECTOR)].filter((element) => {
      if (element.closest(EXCLUDED_ANCESTORS)) return false;
      return (element.textContent ?? "").replace(/\s+/g, " ").trim().length >= 40;
    });
  }

  function applyDecisions(decisions, blocksByKey) {
    let allReady = true;
    for (const decision of decisions) {
      const block = blocksByKey.get(decision.key);
      if (!block) {
        allReady = false;
        continue;
      }

      if (decision.state === "ready" && decision.text) {
        block.element.textContent = decision.text;
        block.element.dataset.plainlyState = "ready";
      } else {
        allReady = false;
        block.element.dataset.plainlyState = "error";
        if (decision.reason) console.warn(`Plainly rejected ${decision.key}: ${decision.reason}`);
      }
    }
    return allReady;
  }

  function revealUnfinishedBlocks(blocks) {
    for (const block of blocks) {
      if (block.element.dataset.plainlyState === "loading") {
        block.element.dataset.plainlyState = "error";
      }
    }
  }

  function addIndicator(level) {
    const existing = document.getElementById("plainly-indicator");
    if (existing) return existing;

    const indicator = document.createElement("button");
    indicator.id = "plainly-indicator";
    indicator.type = "button";
    indicator.textContent = `Plainly · Level ${level}`;
    indicator.title = "Show original text";
    indicator.addEventListener("click", () => {
      const showingOriginal = indicator.dataset.mode === "original";
      for (const element of document.querySelectorAll("[data-plainly-original]")) {
        if (showingOriginal) {
          const adjusted = element.dataset.plainlyAdjusted;
          if (adjusted) element.textContent = adjusted;
        } else {
          element.dataset.plainlyAdjusted = element.textContent ?? "";
          element.textContent = element.dataset.plainlyOriginal ?? "";
        }
      }
      indicator.dataset.mode = showingOriginal ? "adjusted" : "original";
      indicator.textContent = showingOriginal ? `Plainly · Level ${level}` : "Plainly · Original";
      indicator.title = showingOriginal ? "Show original text" : "Show adjusted text";
    });
    document.documentElement.append(indicator);
    return indicator;
  }

  function markIndicatorUnavailable(indicator) {
    indicator.textContent = "Plainly · Couldn’t adjust";
    indicator.title = "Open Plainly and check your API key";
    indicator.disabled = true;
  }
})();
