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
  const CITATION_MARKER_PATTERN = /⟦PLAINLY_CITATION_[A-Z]+⟧/g;

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
      citationPlacements: null,
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
            blocks: requested.map(({ key }) => {
              const block = blocksByKey.get(key);
              return {
                id: key,
                text: block.providerText,
                protectedLinkTexts: uniqueStrings(block.links.map((link) => link.text)),
                protectedCitationMarkers: block.citations.map((citation) => citation.marker),
              };
            }),
          },
        });

        if (!response?.ok) throw new Error(response?.error ?? "Plainly request failed");

        const acceptedProviderBlocks = [];
        for (const adjusted of response.blocks) {
          const block = blocksByKey.get(adjusted.id);
          if (!block) continue;

          const parsed = parseAdjustedCitations(
            adjusted.text,
            block.citations.map((citation) => citation.marker),
          );
          if (!parsed) {
            console.warn(`Plainly rejected ${adjusted.id}: citation markers were not preserved exactly`);
            continue;
          }

          block.citationPlacements = parsed.positions.map((position, index) => ({
            position,
            node: block.citations[index].node,
          }));
          acceptedProviderBlocks.push({ id: adjusted.id, text: parsed.text });
        }

        const decisions = [...session.accept(
          acceptedProviderBlocks.map((block) => block.id),
          acceptedProviderBlocks.map((block) => block.text),
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
    const citations = captureCitations(element);
    return {
      element,
      text: readProseText(element),
      providerText: readProviderText(element, citations),
      originalNodes: cloneChildNodes(element),
      links: captureLinks(element),
      citations,
    };
  }

  function readProseText(element) {
    const clone = element.cloneNode(true);
    for (const citation of topLevelCitations(clone)) citation.remove();
    return normalizeText(clone.textContent ?? "");
  }

  function readProviderText(element, citations) {
    const clone = element.cloneNode(true);
    const clonedCitations = topLevelCitations(clone);
    if (clonedCitations.length !== citations.length) {
      throw new Error("Plainly could not align Wikipedia citations");
    }

    clonedCitations.forEach((citation, index) => {
      citation.replaceWith(document.createTextNode(citations[index].marker));
    });
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
    return topLevelCitations(element).map((citation, index) => ({
      marker: citationMarker(index),
      node: citation.cloneNode(true),
    }));
  }

  function topLevelCitations(element) {
    return [...element.querySelectorAll(CITATION_SELECTOR)]
      .filter((citation) => !citation.parentElement?.closest(CITATION_SELECTOR));
  }

  function citationMarker(index) {
    return `⟦PLAINLY_CITATION_${alphabeticIndex(index)}⟧`;
  }

  function alphabeticIndex(index) {
    let value = index + 1;
    let result = "";
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function parseAdjustedCitations(rawText, expectedMarkers) {
    if (typeof rawText !== "string" || rawText.trim().length === 0) return null;

    const normalized = normalizeText(rawText);
    const markers = normalized.match(CITATION_MARKER_PATTERN) ?? [];
    if (!sameSequence(markers, expectedMarkers)) return null;
    if (normalized.includes("PLAINLY_CITATION") && markers.length === 0 && expectedMarkers.length === 0) {
      return null;
    }

    const compact = normalized.replace(/\s+(?=⟦PLAINLY_CITATION_[A-Z]+⟧)/g, "");
    CITATION_MARKER_PATTERN.lastIndex = 0;

    let rawCursor = 0;
    let cleanText = "";
    const positions = [];
    let match;
    while ((match = CITATION_MARKER_PATTERN.exec(compact)) !== null) {
      cleanText += compact.slice(rawCursor, match.index);
      positions.push(cleanText.length);
      rawCursor = match.index + match[0].length;
    }
    cleanText += compact.slice(rawCursor);
    CITATION_MARKER_PATTERN.lastIndex = 0;

    if (cleanText.includes("PLAINLY_CITATION")) return null;
    if (cleanText.trim() !== cleanText || cleanText.length === 0) return null;
    if (positions.some((position) => position <= 0 || position > cleanText.length)) return null;

    return { text: cleanText, positions };
  }

  function sameSequence(actual, expected) {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
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
        const citationPlacements = block.citationPlacements ?? [];
        if (citationPlacements.length !== block.citations.length) {
          allReady = false;
          block.element.dataset.plainlyState = "error";
          console.warn(`Plainly rejected ${decision.key}: citation placement metadata is incomplete`);
          continue;
        }

        const adjustedNodes = buildAdjustedNodes(decision.text, block.links, citationPlacements);
        if (!adjustedNodes) {
          allReady = false;
          block.element.dataset.plainlyState = "error";
          console.warn(`Plainly rejected ${decision.key}: source links or citations could not be reattached safely`);
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

  function buildAdjustedNodes(text, links, citationPlacements) {
    const adjustedText = text.trim();
    const linkRanges = [];

    for (const link of links) {
      const range = findUnclaimedRange(adjustedText, link.text, linkRanges);
      if (!range) return null;
      linkRanges.push({ ...range, link });
    }
    linkRanges.sort((left, right) => left.start - right.start);

    const citations = [...citationPlacements].sort((left, right) => left.position - right.position);
    for (const citation of citations) {
      if (citation.position < 0 || citation.position > adjustedText.length) return null;
      const insideLink = linkRanges.some((range) => (
        citation.position > range.start && citation.position < range.end
      ));
      if (insideLink) return null;
    }

    const nodes = [];
    let cursor = 0;
    let citationIndex = 0;

    const appendPlainThrough = (target, includeAtTarget) => {
      while (citationIndex < citations.length) {
        const citation = citations[citationIndex];
        const beforeTarget = citation.position < target;
        const atIncludedTarget = includeAtTarget && citation.position === target;
        if (!beforeTarget && !atIncludedTarget) break;
        if (citation.position < cursor) return false;
        if (citation.position > cursor) {
          nodes.push(document.createTextNode(adjustedText.slice(cursor, citation.position)));
        }
        nodes.push(citation.node.cloneNode(true));
        cursor = citation.position;
        citationIndex += 1;
      }

      if (target > cursor) {
        nodes.push(document.createTextNode(adjustedText.slice(cursor, target)));
      }
      cursor = target;
      return true;
    };

    for (const range of linkRanges) {
      if (!appendPlainThrough(range.start, true)) return null;

      const linkedNode = range.link.node.cloneNode(true);
      linkedNode.textContent = adjustedText.slice(range.start, range.end);
      nodes.push(linkedNode);
      cursor = range.end;

      while (citationIndex < citations.length && citations[citationIndex].position === range.end) {
        nodes.push(citations[citationIndex].node.cloneNode(true));
        citationIndex += 1;
      }
    }

    if (!appendPlainThrough(adjustedText.length, true)) return null;
    return citationIndex === citations.length ? nodes : null;
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
