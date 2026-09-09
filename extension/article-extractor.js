(() => {
  const WIKIPEDIA_ROOT = "#mw-content-text .mw-parser-output";
  const GENERAL_ROOTS = [
    "article",
    "[itemprop='articleBody']",
    "[role='article']",
  ].join(",");
  const EXCLUDED_ANCESTORS = [
    ".infobox",
    ".navbox",
    ".vertical-navbox",
    ".reflist",
    ".references",
    ".toc",
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "dialog",
    "table",
    "style",
    "script",
    "[aria-hidden='true']",
    "[role='navigation']",
    "[role='complementary']",
    "[role='contentinfo']",
    ".sidebar",
    ".comments",
    ".comment",
    ".related",
    ".recommendations",
    ".advertisement",
    ".advert",
    ".ad",
    ".promo",
  ].join(",");
  const EXCLUDED_INLINE_CONTENT = [
    "sup.reference",
    ".mw-editsection",
    "script",
    "style",
    "button",
  ].join(",");

  function findArticle() {
    const wikipedia = document.querySelector(WIKIPEDIA_ROOT);
    if (wikipedia) return buildArticle(wikipedia, "wikipedia");

    const candidates = [...document.querySelectorAll(GENERAL_ROOTS)]
      .map((root) => buildArticle(root, "web"))
      .filter((article) => article.blocks.length >= 2 && article.characterCount >= 300)
      .sort((a, b) => articleScore(b) - articleScore(a));

    return candidates[0] ?? null;
  }

  function buildArticle(root, kind) {
    const selector = kind === "wikipedia" ? "p, li" : "p, li";
    const blocks = [...root.querySelectorAll(selector)]
      .filter((element) => !element.closest(EXCLUDED_ANCESTORS))
      .map((element) => ({
        element,
        originalText: element.textContent ?? "",
        sourceText: extractReadableText(element),
      }))
      .filter((block) => normalize(block.sourceText).length >= (kind === "wikipedia" ? 40 : 60));

    const characterCount = blocks.reduce((sum, block) => sum + normalize(block.sourceText).length, 0);
    return {
      root,
      kind,
      blocks,
      characterCount,
      title: findTitle(root),
    };
  }

  function articleScore(article) {
    const headingBonus = article.root.querySelector("h1") ? 500 : 0;
    const semanticBonus = article.root.matches("article, [itemprop='articleBody']") ? 400 : 0;
    return article.characterCount + article.blocks.length * 80 + headingBonus + semanticBonus;
  }

  function findTitle(root) {
    return normalize(
      root.querySelector("h1")?.textContent
      ?? document.querySelector("main h1, [role='main'] h1, h1")?.textContent
      ?? document.title,
    );
  }

  function extractReadableText(element) {
    const clone = element.cloneNode(true);
    for (const excluded of clone.querySelectorAll(EXCLUDED_INLINE_CONTENT)) excluded.remove();
    return clone.textContent ?? "";
  }

  function normalize(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }

  function waitForArticle(timeoutMs = 5000) {
    const existing = findArticle();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      };
      const observer = new MutationObserver(() => {
        const article = findArticle();
        if (article) finish(article);
      });
      const timer = setTimeout(() => finish(findArticle()), timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  globalThis.PlainlyArticleExtractor = Object.freeze({ findArticle, waitForArticle });
})();
