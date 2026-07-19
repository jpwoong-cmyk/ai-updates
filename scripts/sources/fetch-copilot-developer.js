import * as cheerio from "cheerio";

export const COPILOT_DEVELOPER_CHANGELOG_URLS = [
  "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/whats-new",
  "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/whats-new-history"
];

const MONTH_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i;

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

export async function fetchCopilotDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const responses = await Promise.all(
    COPILOT_DEVELOPER_CHANGELOG_URLS.map(async function (url) {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
        },
        redirect: "follow"
      });

      if (!response.ok) {
        throw new Error(
          `Microsoft 365 Copilot developer changelog request failed with HTTP ${response.status} for ${url}.`
        );
      }

      return {
        url,
        html: await response.text()
      };
    })
  );

  const entries = responses.flatMap(function (result) {
    return parseCopilotDeveloperChangelog(result.html, result.url);
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Microsoft 365 Copilot developer pages were fetched, but no release entries could be extracted."
    );
  }

  return deduplicated;
}

export function parseCopilotDeveloperChangelog(
  html,
  sourceUrl = COPILOT_DEVELOPER_CHANGELOG_URLS[0]
) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Microsoft 365 Copilot developer changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const allNodes = articleRoot.find("*").toArray();
  const headings = articleRoot.find("h2, h3").toArray();
  const monthHeadings = headings.filter(function (node) {
    return $(node).is("h2") && MONTH_PATTERN.test(cleanText($(node).text()));
  });

  if (!monthHeadings.length) {
    throw new Error(
      "No Microsoft 365 Copilot developer month headings were found. Microsoft may have changed the page markup."
    );
  }

  const entries = [];
  let activeMonth = null;

  headings.forEach(function (headingNode, headingIndex) {
    const heading = $(headingNode);
    const headingText = cleanText(heading.text());

    if (heading.is("h2")) {
      activeMonth = normaliseMonth(headingText);
      return;
    }

    if (!heading.is("h3") || !activeMonth) {
      return;
    }

    const startIndex = allNodes.indexOf(headingNode);
    const nextHeading = headings[headingIndex + 1];
    const endIndex = nextHeading ? allNodes.indexOf(nextHeading) : allNodes.length;

    if (startIndex < 0 || endIndex <= startIndex) {
      return;
    }

    const contentNodes = allNodes.slice(startIndex + 1, endIndex);
    const summary = formatReleaseContent($, contentNodes);

    if (!summary) {
      return;
    }

    const title = headingText;

    entries.push({
      id: `copilot-developer-${activeMonth.date}-${slugify(title)}`,
      providerId: "copilot",
      providerName: "Microsoft",
      product: "Microsoft 365 Copilot Extensibility",
      audience: "developer",
      title,
      date: activeMonth.date,
      datePrecision: "month",
      summary,
      tags: classifyCopilotDeveloperTags(title, summary),
      sourceUrl: buildSourceUrl(sourceUrl, heading)
    });
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Microsoft 365 Copilot developer month headings were found, but no titled releases could be extracted."
    );
  }

  return deduplicated;
}

function findArticleRoot($) {
  const selectors = [
    "main [data-bi-name='content']",
    "main article",
    "article",
    "main",
    "[role='main']"
  ];

  for (const selector of selectors) {
    const match = $(selector).first();
    if (
      match.length &&
      match.find("h2").filter(function () {
        return MONTH_PATTERN.test(cleanText($(this).text()));
      }).length
    ) {
      return match;
    }
  }

  return $.root();
}

function formatReleaseContent($, nodes) {
  const selected = new Set();
  const blocks = [];

  nodes.forEach(function (node) {
    const element = $(node);

    if (hasSelectedAncestor(node, selected)) {
      return;
    }

    if (
      element.is(
        "script, style, nav, footer, form, button, svg, noscript, img, picture, video"
      )
    ) {
      return;
    }

    if (element.is("ul, ol")) {
      if (!element.parents("ul, ol").length) {
        const listText = formatListAsText($, element);
        if (listText) {
          blocks.push(listText);
          selected.add(node);
        }
      }
      return;
    }

    if (element.is("p, blockquote, pre")) {
      const text = cleanText(element.text());
      if (text) {
        blocks.push(text);
        selected.add(node);
      }
    }
  });

  return removeConsecutiveDuplicates(blocks).join("\n\n").trim();
}

function formatListAsText($, list, depth = 0) {
  const lines = [];

  list.children("li").each(function () {
    const item = $(this);
    const copy = item.clone();
    copy.children("ul, ol").remove();

    const mainText = cleanText(copy.text());
    if (mainText) {
      lines.push(`${"  ".repeat(depth)}• ${mainText}`);
    }

    item.children("ul, ol").each(function () {
      const nested = formatListAsText($, $(this), depth + 1);
      if (nested) {
        lines.push(nested);
      }
    });
  });

  return lines.join("\n").trim();
}

function normaliseMonth(value) {
  const match = String(value || "").match(MONTH_PATTERN);
  if (!match) {
    return null;
  }

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) {
    return null;
  }

  return {
    date: `${match[2]}-${month}-01`,
    label: `${match[1]} ${match[2]}`
  };
}

function classifyCopilotDeveloperTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "retired", "removed", "no longer available"])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, ["pricing", "price", "billing", "cost", "usage billing"])) {
    tags.push("Pricing");
  }

  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue"])) {
    tags.push("Fixed");
  }

  if (containsAny(text, ["model", "foundation model", "language model"])) {
    tags.push("Model update");
  }

  if (containsAny(text, ["api", "sdk", "manifest", "schema", "mcp", "graph", "cli", "connector", "extensibility"])) {
    tags.push("API");
  }

  if (containsAny(text, ["new ", "added", "available", "preview", "generally available", "enable", "support for"])) {
    tags.push("New feature");
  }

  if (containsAny(text, ["updated", "improved", "increased", "expanded", "new version", "enhanced"])) {
    tags.push("Improvement");
  }

  if (containsAny(text, ["security", "privacy", "compliance", "governance", "policy", "admin controls"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["New feature"];
}

function buildSourceUrl(sourceUrl, heading) {
  const id = heading.attr("id") || heading.closest("[id]").attr("id");
  return id ? `${sourceUrl}#${encodeURIComponent(id)}` : sourceUrl;
}

function deduplicateEntries(entries) {
  const byKey = new Map();

  entries.forEach(function (entry) {
    const key = `${entry.date}|${entry.title.toLowerCase()}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, entry);
      return;
    }

    if (entry.summary.length > existing.summary.length) {
      existing.summary = entry.summary;
      existing.sourceUrl = entry.sourceUrl;
    }

    existing.tags = Array.from(new Set(existing.tags.concat(entry.tags)));
  });

  return Array.from(byKey.values());
}

function hasSelectedAncestor(node, selected) {
  let parent = node && node.parent;
  while (parent) {
    if (selected.has(parent)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function removeConsecutiveDuplicates(lines) {
  return lines.filter(function (line, index) {
    return index === 0 || line !== lines[index - 1];
  });
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
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
