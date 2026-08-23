(() => {
  const BLOCK_SELECTOR = ["#mw-content-text .mw-parser-output p", "#mw-content-text .mw-parser-output li"].join(",");
  const EXCLUDED_ANCESTORS = [".infobox", ".navbox", ".vertical-navbox", ".reflist", ".references", ".toc", "table", "style", "script"].join(",");
  document.documentElement.classList.add("plainly-pending");
  void bootstrap();

  async function bootstrap() {
    const settingsResponse = await chrome.runtime.sendMessage({ type: "PLAINLY_GET_SETTINGS" });
    const settings = settingsResponse?.settings;
    if (!settingsResponse?.ok || !settings?.enabled || !settings.hasApiKey) { leaveAdjustedMode(); return; }
    document.documentElement.classList.add("plainly-enabled");
    await waitForArticle();
    const blocks = collectBlocks();
    if (blocks.length === 0) { leaveAdjustedMode(); return; }
    for (const block of blocks) { block.element.dataset.plainlyState = "loading"; block.element.dataset.plainlyOriginal = block.text; }
    document.documentElement.classList.remove("plainly-pending");
    const indicator = addIndicator(settings);
    const [first, ...rest] = blocks;
    const firstAdjusted = await transformBatch([first], settings);
    if (!firstAdjusted) { for (const block of rest) block.element.dataset.plainlyState = "error"; markIndicatorUnavailable(indicator); return; }
    for (let index = 0; index < rest.length; index += 4) await transformBatch(rest.slice(index, index + 4), settings);
  }

  function leaveAdjustedMode() { document.documentElement.classList.remove("plainly-pending", "plainly-enabled"); }
  function waitForArticle() {
    const existing = document.querySelector("#mw-content-text .mw-parser-output");
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const article = document.querySelector("#mw-content-text .mw-parser-output");
        if (!article) return;
        observer.disconnect(); resolve(article);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }
  function collectBlocks() { return [...document.querySelectorAll(BLOCK_SELECTOR)].filter(isReadableBlock).map((element, index) => ({ id: `block-${index}`, element, text: normalizeText(element.textContent ?? "") })); }
  function isReadableBlock(element) { if (element.closest(EXCLUDED_ANCESTORS)) return false; return normalizeText(element.textContent ?? "").length >= 40; }
  function normalizeText(text) { return text.replace(/\s+/g, " ").trim(); }

  async function transformBatch(blocks, settings) {
    if (blocks.length === 0) return true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "PLAINLY_SIMPLIFY",
        payload: {
          scheme: settings.scheme,
          level: settings.level,
          url: location.href,
          title: document.querySelector("#firstHeading")?.textContent?.trim() ?? document.title,
          blocks: blocks.map(({ id, text }) => ({ id, text })),
        },
      });
      if (!response?.ok) throw new Error(response?.error ?? "Plainly request failed");
      const byId = new Map(response.blocks.map((block) => [block.id, block.text]));
      for (const block of blocks) {
        const adjusted = byId.get(block.id);
        if (!adjusted) throw new Error(`Missing adjusted text for ${block.id}`);
        block.element.textContent = adjusted; block.element.dataset.plainlyState = "ready";
      }
      return true;
    } catch (error) {
      console.warn("Plainly could not adjust a block; restoring original text.", error);
      for (const block of blocks) block.element.dataset.plainlyState = "error";
      return false;
    }
  }

  function targetLabel(settings) {
    if (settings.scheme === "oxford") return `Oxford ${settings.level}`;
    if (settings.scheme === "fountasPinnell") return `F&P ${settings.level}`;
    if (settings.scheme === "dibels8") return `DIBELS Grade ${settings.level}`;
    return String(settings.level);
  }

  function addIndicator(settings) {
    const existing = document.getElementById("plainly-indicator"); if (existing) return existing;
    const label = targetLabel(settings);
    const indicator = document.createElement("button"); indicator.id = "plainly-indicator"; indicator.type = "button"; indicator.textContent = `Plainly · ${label}`; indicator.title = "Show original text";
    indicator.addEventListener("click", () => {
      const showingOriginal = indicator.dataset.mode === "original";
      for (const element of document.querySelectorAll("[data-plainly-original]")) {
        if (showingOriginal) { const adjusted = element.dataset.plainlyAdjusted; if (adjusted) element.textContent = adjusted; }
        else { element.dataset.plainlyAdjusted = element.textContent ?? ""; element.textContent = element.dataset.plainlyOriginal ?? ""; }
      }
      indicator.dataset.mode = showingOriginal ? "adjusted" : "original";
      indicator.textContent = showingOriginal ? `Plainly · ${label}` : "Plainly · Original";
      indicator.title = showingOriginal ? "Show original text" : "Show adjusted text";
    });
    document.documentElement.append(indicator); return indicator;
  }
  function markIndicatorUnavailable(indicator) { indicator.textContent = "Plainly · Couldn’t adjust"; indicator.title = "Open Plainly and check your API key"; indicator.disabled = true; }
})();
