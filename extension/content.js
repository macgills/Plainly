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
  const CITATION_SELECTOR = "sup.reference, .mw-ref";

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

    const prepared = elements.map(prepareReadableElement);
    const title = document.querySelector("#firstHeading")?.textContent?.trim() ?? document.title;
    let session;
    try {
      session = kmp.PlainlyCoreJs.createSession(
        location.href,
        title,
        settings.level,
        prepared.map((block) => block.text),
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
      ...prepared[index],
      adjustedNodes: null,
    }));
    const blocksByKey = new Map(blocks.map((block) => [block.key, block]));

    for (const block of blocks) {
      block.element.dataset.plainlyState = "loading";
      block.element.dataset.plainlyOriginal = block.text;
    }

    document.documentElement.classList.remove("plainly-pending");
    const indicator = addIndicator(settings.level, blocks);
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
            blocks: requested.map(({ key, text }) => {
              const block = blocksByKey.get(key);
              return {
                id: key,
                text,
                protectedLinkTexts: uniqueStrings(block?.links.map((link) => link.text) ?? []),
              };
            }),
          },
        });

        if (!response?.ok) throw new Error(response?.error ?? "Plainly request failed");

        const decisions = [...session.accept(
          response.blocks.map((block) => block.id),
          response.blocks.map((block) => block.text),
        )];
        const allReady = applyDecisions(decisions, blocksByKey, indicator);

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
      return readProseText(element).length >= 40;
    });
  }

  function prepareReadableElement(element) {
    return {
      element,
      text: readProseText(element),
      originalNodes: cloneChildNodes(element),
      links: captureLinks(element),
      citations: captureCitations(element),
    };
  }

  function readProseText(element) {
    const clone = element.cloneNode(true);
    for (const citation of clone.querySelectorAll(CITATION_SELECTOR)) citation.remove();
    return normalizeText(clone.textContent ?? "");
  }

  function captureLinks(element) {
    return [...element.querySelectorAll("a[href]")]
      .filter((link) => !link.closest(CITATION_SELECTOR))
      .map((link) => ({
        text: normalizeText(link.textContent ?? ""),
        node: link.cloneNode(true),
      }))
      .filter((link) => link.text.length > 0);
  }

  function captureCitations(element) {
    return [...element.querySelectorAll(CITATION_SELECTOR)]
      .filter((citation) => !citation.parentElement?.closest(CITATION_SELECTOR))
      .map((citation) => citation.cloneNode(true));
  }

  function applyDecisions(decisions, blocksByKey, indicator) {
    let allReady = true;
    for (const decision of decisions) {
      const block = blocksByKey.get(decision.key);
      if (!block) {
        allReady = false;
        continue;
      }

      if (decision.state === "ready" && decision.text) {
        const adjustedNodes = buildAdjustedNodes(decision.text, block.links, block.citations);
        if (!adjustedNodes) {
          allReady = false;
          block.element.dataset.plainlyState = "error";
          console.warn(`Plainly rejected ${decision.key}: adjusted text dropped a linked source term`);
          continue;
        }

        block.adjustedNodes = cloneNodes(adjustedNodes);
        if (indicator.dataset.mode !== "original") {
          block.element.replaceChildren(...cloneNodes(adjustedNodes));
        }
        block.element.dataset.plainlyState = "ready";
      } else {
        allReady = false;
        block.element.dataset.plainlyState = "error";
        if (decision.reason) console.warn(`Plainly rejected ${decision.key}: ${decision.reason}`);
      }
    }
    return allReady;
  }

  function buildAdjustedNodes(text, links, citations) {
    const adjustedText = text.trim();
    const ranges = [];

    for (const link of links) {
      const range = findUnclaimedRange(adjustedText, link.text, ranges);
      if (!range) return null;
      ranges.push({ ...range, link });
    }

    ranges.sort((left, right) => left.start - right.start);
    const nodes = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        nodes.push(document.createTextNode(adjustedText.slice(cursor, range.start)));
      }

      const linkedText = adjustedText.slice(range.start, range.end);
      const linkedNode = range.link.node.cloneNode(true);
      linkedNode.textContent = linkedText;
      nodes.push(linkedNode);
      cursor = range.end;
    }

    if (cursor < adjustedText.length) {
      nodes.push(document.createTextNode(adjustedText.slice(cursor)));
    }

    if (citations.length > 0) {
      nodes.push(document.createTextNode(" "));
      nodes.push(...cloneNodes(citations));
    }

    return nodes;
  }

  function findUnclaimedRange(text, linkedText, claimedRanges) {
    const words = linkedText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    const pattern = words.map(escapeRegExp).join("\\s+");
    const matcher = new RegExp(pattern, "giu");
    let match;
    while ((match = matcher.exec(text)) !== null) {
      const candidate = { start: match.index, end: match.index + match[0].length };
      const overlaps = claimedRanges.some((claimed) => (
        candidate.start < claimed.end && claimed.start < candidate.end
      ));
      if (!overlaps) return candidate;
    }
    return null;
  }

  function revealUnfinishedBlocks(blocks) {
    for (const block of blocks) {
      if (block.element.dataset.plainlyState === "loading") {
        block.element.dataset.plainlyState = "error";
      }
    }
  }

  function addIndicator(level, blocks) {
    const existing = document.getElementById("plainly-indicator");
    if (existing) return existing;

    const indicator = document.createElement("button");
    indicator.id = "plainly-indicator";
    indicator.type = "button";
    indicator.textContent = `Plainly · Level ${level}`;
    indicator.title = "Show original text";
    indicator.dataset.mode = "adjusted";
    indicator.addEventListener("click", () => {
      const showingOriginal = indicator.dataset.mode === "original";
      for (const block of blocks) {
        if (!block.adjustedNodes) continue;
        const nodes = showingOriginal ? block.adjustedNodes : block.originalNodes;
        block.element.replaceChildren(...cloneNodes(nodes));
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

  function cloneChildNodes(element) {
    return cloneNodes([...element.childNodes]);
  }

  function cloneNodes(nodes) {
    return nodes.map((node) => node.cloneNode(true));
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function uniqueStrings(values) {
    return [...new Set(values)];
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
