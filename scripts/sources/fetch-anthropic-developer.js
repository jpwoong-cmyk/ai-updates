import * as cheerio from "cheerio";

export const ANTHROPIC_DEVELOPER_CHANGELOG_URL =
  "https://platform.claude.com/docs/en/release-notes/overview";

const DATE_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i;

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

export async function fetchAnthropicDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(ANTHROPIC_DEVELOPER_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Claude Platform release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseAnthropicDeveloperChangelog(await response.text());
}

export function parseAnthropicDeveloperChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Claude Platform release-notes HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const allNodes = articleRoot.find("*").toArray();
  const dateHeadings = findDateHeadings($, articleRoot).toArray();

  if (!dateHeadings.length) {
    throw new Error(
      "No Claude Platform release-date headings were found. Anthropic may have changed the page markup."
    );
  }

  const entries = [];

  dateHeadings.forEach(function (headingNode, headingIndex) {
    const heading = $(headingNode);
    const dateText = cleanText(heading.attr("data-text") || heading.text());
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
        const summary = formatListItem($, $(itemNode));
        if (!summary) {
          return;
        }

        entries.push(createEntry(date, summary, heading));
      });
      return;
    }

    const paragraphs = sectionNodes
      .filter(function (node) {
        return $(node).is("p") && !$(node).parents("li").length;
      })
      .map(function (node) {
        return cleanText($(node).text());
      })
      .filter(function (text) {
        return text && text !== "";
      });

    paragraphs.forEach(function (summary) {
      entries.push(createEntry(date, summary, heading));
    });
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Claude Platform date headings were found, but no release entries could be extracted."
    );
  }

  return deduplicated;
}

function findArticleRoot($) {
  const selectors = [
    "main article",
    "article",
    "main",
    "[role='main']"
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
  const semanticHeadings = root.find("h2, h3, h4").filter(function () {
    const element = $(this);
    return DATE_PATTERN.test(
      cleanText(element.attr("data-text") || element.text())
    );
  });

  if (semanticHeadings.length) {
    return semanticHeadings;
  }

  return root.find("[role='heading']").filter(function () {
    return DATE_PATTERN.test(cleanText($(this).text()));
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

function createEntry(date, summary, heading) {
  const title = createTitle(summary);

  return {
    id: `anthropic-developer-${date}-${slugify(title)}`,
    providerId: "anthropic",
    providerName: "Anthropic",
    product: "Claude Platform",
    audience: "developer",
    title,
    date,
    datePrecision: "day",
    summary,
    tags: classifyAnthropicDeveloperTags(title, summary),
    sourceUrl: buildSourceUrl(heading)
  };
}

function createTitle(summary) {
  return firstWords(
    String(summary || "")
      .replace(/^[\s•–—-]+/gm, " ")
      .replace(/\s+/g, " ")
      .trim(),
    10
  );
}

function classifyAnthropicDeveloperTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "retired", "retirement", "removed", "end of support"])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, ["pricing", "price", "billing", "cost", "usage tier"])) {
    tags.push("Pricing");
  }

  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue", "error", "reliability"])) {
    tags.push("Fixed");
  }

  if (containsAny(text, ["model", "opus", "sonnet", "haiku", "context window"])) {
    tags.push("Model update");
  }

  if (containsAny(text, ["api", "sdk", "console", "endpoint", "tool", "prompt caching", "beta header", "rate limit"])) {
    tags.push("API");
  }

  if (containsAny(text, ["launched", "released", "introduced", "added", "now available", "support for"])) {
    tags.push("New feature");
  }

  if (containsAny(text, ["updated", "improved", "enhanced", "expanded", "increased", "unified"])) {
    tags.push("Improvement");
  }

  if (containsAny(text, ["safety", "security", "privacy", "compliance", "hipaa", "protected health information"])) {
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

function buildSourceUrl(heading) {
  const id = heading.attr("id") || heading.closest("[id]").attr("id");

  return id
    ? `${ANTHROPIC_DEVELOPER_CHANGELOG_URL}#${encodeURIComponent(id)}`
    : ANTHROPIC_DEVELOPER_CHANGELOG_URL;
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
