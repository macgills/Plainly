(() => {
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
    const extractor = globalThis.PlainlyArticleExtractor;
    if (!extractor?.waitForArticle) {
      console.warn("Plainly article extractor is unavailable; showing the original article.");
      leaveAdjustedMode();
      return;
    }

    let target;
    try {
      target = kmp.PlainlyCoreJs.resolveReadingTarget(
        settings.scheme,
        settings.level,
        settings.dibelsPeriod ?? "",
        settings.dibelsMazeScore ?? "",
      );
    } catch (error) {
      console.warn("Plainly reading target is invalid; showing the original article.", error);
      leaveAdjustedMode();
      return;
    }

    const article = await extractor.waitForArticle();
    if (!article || article.blocks.length === 0) {
      leaveAdjustedMode();
      return;
    }

    document.documentElement.classList.add("plainly-enabled");
    const readableBlocks = article.blocks;
    const title = article.title || document.title;
    let session;
    try {
      session = kmp.PlainlyCoreJs.createSession(
        location.href,
        title,
        settings.scheme,
        settings.level,
        settings.dibelsPeriod ?? "",
        settings.dibelsMazeScore ?? "",
        readableBlocks.map((block) => block.sourceText),
        1,
        4,
      );
    } catch (error) {
      console.warn("Plainly could not initialize its KMP core; showing the original article.", error);
      leaveAdjustedMode();
      return;
    }

    const sourceBlocks = [...session.sourceBlocks()];
    if (sourceBlocks.length !== readableBlocks.length) {
      console.warn("Plainly core returned a different block count; showing the original article.");
      leaveAdjustedMode();
      return;
    }

    const blocks = sourceBlocks.map((source, index) => ({
      key: source.key,
      text: source.text,
      element: readableBlocks[index].element,
      originalText: readableBlocks[index].originalText,
    }));
    const blocksByKey = new Map(blocks.map((block) => [block.key, block]));

    for (const block of blocks) {
      block.element.dataset.plainlyState = "loading";
      block.element.dataset.plainlyOriginal = block.originalText;
    }

    document.documentElement.classList.remove("plainly-pending");
    const indicator = addIndicator(target.label);
    indicator.dataset.engine = "kmp";
    indicator.dataset.articleKind = article.kind;

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
            url: location.href,
            title,
            readingTarget: toPromptTarget(target),
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
          markIndicatorUnavailable(indicator, "The adjusted response did not pass Plainly's fidelity checks.");
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
          markIndicatorUnavailable(indicator, reason);
          return;
        }
      }

      firstBatch = false;
    }
  }

  function toPromptTarget(target) {
    const recommendation = target.recommendation;
    return {
      schemeId: target.schemeId,
      scheme: target.schemeName,
      level: target.level,
      guidance: target.guidance,
      qualification: target.disclaimer,
      recommendation: recommendation ? {
        band: recommendation.band,
        benchmarkLabel: recommendation.benchmarkLabel,
        support: recommendation.support,
        assessedGrade: recommendation.assessedGrade,
        accessGrade: recommendation.accessGrade,
        approximateCrosswalk: {
          lexile: recommendation.lexile,
          fountasPinnell: recommendation.fountasPinnell,
          oxford: recommendation.oxford,
        },
      } : null,
    };
  }

  function leaveAdjustedMode() {
    document.documentElement.classList.remove("plainly-pending", "plainly-enabled");
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

  function addIndicator(label) {
    const existing = document.getElementById("plainly-indicator");
    if (existing) return existing;

    const indicator = document.createElement("button");
    indicator.id = "plainly-indicator";
    indicator.type = "button";
    indicator.textContent = `Plainly · ${label}`;
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
      indicator.textContent = showingOriginal ? `Plainly · ${label}` : "Plainly · Original";
      indicator.title = showingOriginal ? "Show original text" : "Show adjusted text";
    });
    document.documentElement.append(indicator);
    return indicator;
  }

  function markIndicatorUnavailable(indicator, reason) {
    const detail = typeof reason === "string" && reason.trim() ? reason.trim() : "Unknown adjustment error.";
    indicator.textContent = "Plainly · Couldn’t adjust";
    indicator.setAttribute("aria-label", `Plainly · Couldn’t adjust · ${detail}`);
    indicator.title = detail;
    indicator.disabled = true;
  }
})();
