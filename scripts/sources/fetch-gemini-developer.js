import * as cheerio from "cheerio";

export const GEMINI_DEVELOPER_CHANGELOG_URL =
  "https://ai.google.dev/gemini-api/docs/changelog?hl=en";

const DATE_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i;

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

export async function fetchGeminiDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(GEMINI_DEVELOPER_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Gemini developer changelog request failed with HTTP ${response.status}.`
    );
  }

  return parseGeminiDeveloperChangelog(await response.text());
}

export function parseGeminiDeveloperChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Gemini developer changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const allNodes = articleRoot.find("*").toArray();
  const dateHeadings = findDateHeadings($, articleRoot).toArray();

  if (!dateHeadings.length) {
    throw new Error(
      "No Gemini API release-date headings were found. Google may have changed the page markup."
    );
  }

  const entries = [];

  dateHeadings.forEach(function (headingNode, headingIndex) {
    const dateText = cleanText($(headingNode).text());
    const date = normaliseDate(dateText);

    if (!date) {
      return;
    }

    const startIndex = allNodes.indexOf(headingNode);
    const nextHeading = dateHeadings[headingIndex + 1];
    const endIndex = nextHeading ? allNodes.indexOf(nextHeading) : allNodes.length;

    if (startIndex < 0 || endIndex <= startIndex) {
      return;
    }

    const sectionNodes = allNodes.slice(startIndex + 1, endIndex);
    const topLevelItems = sectionNodes.filter(function (node) {
      const element = $(node);
      return element.is("li") && !element.parents("li").length;
    });

    if (topLevelItems.length) {
      topLevelItems.forEach(function (itemNode) {
        const item = $(itemNode);
        const summary = formatListItem($, item);

        if (!summary) {
          return;
        }

        const category = findNearestCategory($, sectionNodes, itemNode);
        const title = createGeminiTitle(category, summary);

        entries.push(createEntry(date, title, summary, category, $(headingNode)));
      });
      return;
    }

    const paragraphSummary = sectionNodes
      .filter(function (node) {
        return $(node).is("p") && !$(node).parents("li").length;
      })
      .map(function (node) {
        return cleanText($(node).text());
      })
      .filter(Boolean)
      .join("\n\n");

    if (paragraphSummary) {
      const title = firstWords(paragraphSummary, 9);
      entries.push(createEntry(date, title, paragraphSummary, "", $(headingNode)));
    }
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Gemini API date headings were found, but no release entries could be extracted."
    );
  }

  return deduplicated;
}

function findArticleRoot($) {
  const selectors = [
    "article.devsite-article-body",
    ".devsite-article-body",
    "main article",
    "article",
    "main"
  ];

  for (const selector of selectors) {
    const match = $(selector).first();
    if (match.length && findDateHeadings($, match).length) {
      return match;
    }
  }

  return $.root();
}

function findDateHeadings($, root) {
  const devsiteHeadings = root.find("span.devsite-heading").filter(function () {
    return DATE_PATTERN.test(cleanText($(this).text()));
  });

  if (devsiteHeadings.length) {
    return devsiteHeadings;
  }

  return root.find("h2, h3").filter(function () {
    const element = $(this);
    return DATE_PATTERN.test(
      cleanText(element.attr("data-text") || element.text())
    );
  });
}

function formatListItem($, item, depth = 0) {
  const copy = item.clone();
  copy.children("ul, ol").remove();

  const lines = [];
  const mainText = cleanText(copy.text());

  if (mainText) {
    lines.push(`${"  ".repeat(depth)}• ${mainText}`);
  }

  item.children("ul, ol").each(function () {
    $(this).children("li").each(function () {
      const nested = formatListItem($, $(this), depth + 1);
      if (nested) {
        lines.push(nested);
      }
    });
  });

  return lines.join("\n").trim();
}

function findNearestCategory($, sectionNodes, itemNode) {
  const itemIndex = sectionNodes.indexOf(itemNode);

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const element = $(sectionNodes[index]);

    if (element.is("li")) {
      continue;
    }

    const text = cleanText(element.text());

    if (/^(API|Model|SDK|AI Studio|Library|Tool|Live API) updates?:?$/i.test(text)) {
      return text.replace(/\s*updates?:?$/i, "");
    }

    if (element.is("h3, h4")) {
      break;
    }
  }

  return "";
}

function createGeminiTitle(category, summary) {
  const mainText = summary
    .replace(/^[\s•–—-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = firstWords(mainText, 9);

  return category ? `${category}: ${title}` : title;
}

function createEntry(date, title, summary, category, headingNode) {
  return {
    id: `gemini-developer-${date}-${slugify(title)}`,
    providerId: "gemini",
    providerName: "Google",
    product: "Gemini API",
    audience: "developer",
    title,
    date,
    datePrecision: "day",
    summary,
    tags: classifyGeminiDeveloperTags(title, summary, category),
    sourceUrl: buildSourceUrl(headingNode)
  };
}

function classifyGeminiDeveloperTags(title, summary, category) {
  const text = `${category} ${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "sunset", "shut down", "no longer supported", "retired"])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, ["pricing", "price", "billing", "cost", "paid tier"])) {
    tags.push("Pricing");
  }

  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue", "reliability"])) {
    tags.push("Fixed");
  }

  if (containsAny(text, ["model", "gemini", "gemma", "imagen", "veo", "lyria", "embedding"])) {
    tags.push("Model update");
  }

  if (containsAny(text, ["api", "sdk", "library", "generatecontent", "live api", "function call", "tool", "endpoint"])) {
    tags.push("API");
  }

  if (containsAny(text, ["released", "launched", "introduced", "added", "support for", "now available"])) {
    tags.push("New feature");
  }

  if (containsAny(text, ["updated", "improved", "enhanced", "expanded", "increased", "faster"])) {
    tags.push("Improvement");
  }

  if (containsAny(text, ["safety", "responsible ai", "content filter", "harm", "security"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["API"];
}

function normaliseDate(value) {
  const match = String(value || "").match(DATE_PATTERN);
  if (!match) {
    return "";
  }

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) {
    return "";
  }

  return `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}`;
}

function buildSourceUrl(headingNode) {
  const container = headingNode.is("h2, h3")
    ? headingNode
    : headingNode.closest("h2, h3");
  const id = container.attr("id") || headingNode.attr("id");

  return id
    ? `${GEMINI_DEVELOPER_CHANGELOG_URL}#${encodeURIComponent(id)}`
    : GEMINI_DEVELOPER_CHANGELOG_URL;
}

function deduplicateEntries(entries) {
  const byKey = new Map();

  entries.forEach(function (entry) {
    const key = `${entry.date}|${entry.title.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, entry);
      return;
    }

    const existing = byKey.get(key);
    if (entry.summary.length > existing.summary.length) {
      existing.summary = entry.summary;
    }
    existing.tags = Array.from(new Set(existing.tags.concat(entry.tags)));
  });

  return Array.from(byKey.values());
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function firstWords(value, count) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(" ");
}

function slugify(value) {
  return String(value || "update")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "update";
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
