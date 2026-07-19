import * as cheerio from "cheerio";

export const COPILOT_CHANGELOG_URLS = [
  "https://learn.microsoft.com/en-us/microsoft-365/copilot/release-notes?tabs=all",
  "https://learn.microsoft.com/en-us/microsoft-365/copilot/previous-year-release-notes?tabs=all",
  "https://learn.microsoft.com/en-us/microsoft-365/copilot/release-notes-archive?tabs=all"
];

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

const MONTH_NAMES = Object.keys(MONTHS)
  .map(function (month) {
    return month[0].toUpperCase() + month.slice(1);
  })
  .join("|");

const FULL_DATE_PATTERN = new RegExp(
  `^(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?,\\s*(\\d{4})$`,
  "i"
);

const MONTH_DATE_PATTERN = new RegExp(
  `^(${MONTH_NAMES})(?:,\\s*|\\s+)(\\d{4})$`,
  "i"
);

export async function fetchCopilotChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const urls = Array.isArray(options.urls) && options.urls.length
    ? options.urls
    : COPILOT_CHANGELOG_URLS;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const pages = [];

  for (const sourceUrl of urls) {
    const response = await fetchImpl(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(
        `Microsoft 365 Copilot changelog request failed for ${sourceUrl} with HTTP ${response.status}.`
      );
    }

    pages.push({
      html: await response.text(),
      sourceUrl
    });
  }

  return mergeCopilotChangelogPages(pages);
}

export function mergeCopilotChangelogPages(pages) {
  if (!Array.isArray(pages) || !pages.length) {
    throw new Error("At least one Microsoft 365 Copilot changelog page is required.");
  }

  const entriesById = new Map();

  pages.forEach(function (page) {
    const entries = parseCopilotChangelog(page && page.html, {
      sourceUrl: page && page.sourceUrl
    });

    entries.forEach(function (entry) {
      const existing = entriesById.get(entry.id);

      if (!existing) {
        entriesById.set(entry.id, entry);
        return;
      }

      const preferredSummary = existing.summary.length >= entry.summary.length
        ? existing.summary
        : entry.summary;

      entriesById.set(entry.id, {
        ...existing,
        summary: preferredSummary,
        tags: Array.from(new Set([...existing.tags, ...entry.tags]))
      });
    });
  });

  const entries = Array.from(entriesById.values()).sort(function (first, second) {
    const dateOrder = second.date.localeCompare(first.date);

    return dateOrder || first.title.localeCompare(second.title);
  });

  if (!entries.length) {
    throw new Error(
      "Microsoft 365 Copilot pages were loaded, but no release-note entries could be extracted."
    );
  }

  return entries;
}

export function parseCopilotChangelog(html, options = {}) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Microsoft 365 Copilot changelog HTML was empty.");
  }

  const sourceUrl = cleanText(options.sourceUrl) || COPILOT_CHANGELOG_URLS[0];
  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const contentRoot = findAllFeaturesRoot($, articleRoot);
  const dateHeadings = findDateHeadings($, contentRoot);

  if (!dateHeadings.length) {
    throw new Error(
      "No Microsoft 365 Copilot release-date headings were found. Microsoft Learn may have changed the page markup."
    );
  }

  const entriesById = new Map();
  let currentDate = "";
  let currentDateHeading = null;
  let currentSection = "Microsoft 365 Copilot";

  contentRoot.find("h2, h3, li").each(function () {
    const node = $(this);

    if (node.is("h2")) {
      const normalisedDate = normaliseCopilotDate(
        cleanText(node.attr("data-text") || node.text())
      );

      if (normalisedDate) {
        currentDate = normalisedDate;
        currentDateHeading = node;
        currentSection = "Microsoft 365 Copilot";
      }

      return;
    }

    if (!currentDate) {
      return;
    }

    if (node.is("h3")) {
      currentSection = cleanText(node.attr("data-text") || node.text()) || currentSection;
      return;
    }

    if (!isTopLevelReleaseItem($, node)) {
      return;
    }

    const titleElement = findReleaseTitleElement($, node);
    const title = titleElement.length
      ? cleanTitle(titleElement.text())
      : fallbackReleaseTitle($, node);

    if (!title) {
      return;
    }

    const summary = formatReleaseSummary($, node, titleElement, title);
    const identity = `${currentDate}|${normaliseIdentity(title)}`;
    const id = `copilot-${currentDate}-${stableHash(identity)}`;

    const entry = {
      id,
      providerId: "copilot",
      providerName: "Microsoft",
      product: "Microsoft 365 Copilot",
      title,
      date: currentDate,
      summary: summary || title,
      tags: classifyCopilotTags(title, summary, currentSection),
      sourceUrl: buildSourceUrl(sourceUrl, currentDateHeading)
    };

    const existing = entriesById.get(id);

    if (!existing) {
      entriesById.set(id, entry);
      return;
    }

    entriesById.set(id, {
      ...existing,
      summary: existing.summary.length >= entry.summary.length
        ? existing.summary
        : entry.summary,
      tags: Array.from(new Set([...existing.tags, ...entry.tags]))
    });
  });

  const entries = Array.from(entriesById.values()).sort(function (first, second) {
    const dateOrder = second.date.localeCompare(first.date);

    return dateOrder || first.title.localeCompare(second.title);
  });

  if (!entries.length) {
    throw new Error(
      "Microsoft 365 Copilot release-date headings were found, but no release-note list items could be extracted."
    );
  }

  return entries;
}

function findArticleRoot($) {
  const selectors = [
    "main#main .content",
    "main .content",
    "article .content",
    "main#main",
    "article",
    "main",
    "#main"
  ];

  for (const selector of selectors) {
    const candidates = $(selector).filter(function () {
      return findDateHeadings($, $(this)).length > 0;
    });

    if (candidates.length) {
      return candidates.first();
    }
  }

  return $.root();
}

function findAllFeaturesRoot($, articleRoot) {
  const selectors = [
    "[role='tabpanel'][data-tab='all']",
    "section[data-tab='all']",
    "[role='tabpanel'][id$='_all']",
    "[role='tabpanel'][id*='all']"
  ];

  for (const selector of selectors) {
    const match = articleRoot.find(selector).filter(function () {
      return findDateHeadings($, $(this)).length > 0;
    }).first();

    if (match.length) {
      return match;
    }
  }

  return articleRoot;
}

function findDateHeadings($, root) {
  return root.find("h2").filter(function () {
    return Boolean(
      normaliseCopilotDate(cleanText($(this).attr("data-text") || $(this).text()))
    );
  });
}

function isTopLevelReleaseItem($, item) {
  if (!item.is("li") || item.parents("li").length) {
    return false;
  }

  const parentList = item.parent();

  if (!parentList.is("ul, ol")) {
    return false;
  }

  const titleElement = findReleaseTitleElement($, item);

  if (titleElement.length) {
    return true;
  }

  const directText = cleanText(
    item
      .clone()
      .children("ul, ol")
      .remove()
      .end()
      .text()
  );

  return directText.length >= 12 && directText.length <= 260;
}

function findReleaseTitleElement($, item) {
  const directStrong = item.children("strong, b").first();

  if (directStrong.length) {
    return directStrong;
  }

  const firstBlockStrong = item
    .children("p, div")
    .first()
    .find("strong, b")
    .first();

  if (firstBlockStrong.length) {
    return firstBlockStrong;
  }

  return item.find("strong, b").filter(function () {
    return !$(this).parents("ul ul, ul ol, ol ul, ol ol").length;
  }).first();
}

function fallbackReleaseTitle($, item) {
  const copy = item.clone();
  copy.children("ul, ol").remove();

  const firstLine = cleanText(copy.text())
    .split(/(?<=[.!?])\s+/)[0]
    .replace(/^[-•\s]+/, "")
    .trim();

  if (!firstLine) {
    return "";
  }

  return firstWords(firstLine, 16);
}

function cleanTitle(value) {
  return cleanText(value)
    .replace(/^[-•\s]+/, "")
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReleaseSummary($, item, titleElement, title) {
  const copy = item.clone();

  copy.find("script, style, svg, noscript, button, form").remove();

  if (titleElement && titleElement.length) {
    const titlePath = titleElement.get(0);
    const originalItem = item.get(0);
    const path = getNodePath(titlePath, originalItem);
    const clonedTitle = resolveNodePath(copy.get(0), path);

    if (clonedTitle) {
      $(clonedTitle).remove();
    }
  }

  const blocks = [];

  copy.contents().each(function () {
    const formatted = formatContentNode($, this, 0);

    if (formatted) {
      blocks.push(formatted);
    }
  });

  const summary = removeConsecutiveDuplicates(blocks)
    .join("\n\n")
    .replace(/^\s*[-–—:]?\s*/, "")
    .trim();

  if (!summary || normaliseIdentity(summary) === normaliseIdentity(title)) {
    return title;
  }

  return summary;
}

function formatContentNode($, node, depth) {
  if (!node) {
    return "";
  }

  if (node.type === "text") {
    return cleanText(node.data);
  }

  const element = $(node);

  if (element.is("ul, ol")) {
    return formatListAsText($, element, depth);
  }

  if (element.is("br")) {
    return "\n";
  }

  const copy = element.clone();
  copy.children("ul, ol").remove();
  const mainText = cleanText(copy.text());
  const nestedLists = [];

  element.children("ul, ol").each(function () {
    const nested = formatListAsText($, $(this), depth);

    if (nested) {
      nestedLists.push(nested);
    }
  });

  return [mainText, ...nestedLists].filter(Boolean).join("\n").trim();
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

function classifyCopilotTags(title, summary, section) {
  const text = `${title} ${summary} ${section}`.toLowerCase();
  const tags = [];

  if (containsAny(text, [
    "deprecated", "deprecation", "sunset", "retired", "retirement",
    "removed", "discontinued", "end of support", "no longer available"
  ])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, [
    "pricing", "price", "billing", "cost", "subscription", "license fee"
  ])) {
    tags.push("Pricing");
  }

  if (containsAny(text, [
    "fixed", "fix", "bug", "resolved", "issue", "reliability", "stability"
  ])) {
    tags.push("Fixed");
  }

  if (containsAny(text, [
    "model", "gpt-", "gpt ", "claude", "mai-image", "reasoning model"
  ])) {
    tags.push("Model update");
  }

  if (containsAny(text, [
    "api", "sdk", "developer", "connector", "plugin", "extensibility",
    "copilot studio", "agent builder", "endpoint", "graph connector"
  ])) {
    tags.push("API");
  }

  if (containsAny(text, [
    "introducing", "introduced", "launch", "launched", "new ",
    "now available", "available in", "added", "support for", "enables users"
  ])) {
    tags.push("New feature");
  }

  if (containsAny(text, [
    "improved", "improvement", "enhanced", "expanded", "faster",
    "updated", "upgrade", "streamlined", "redesigned", "more accurate"
  ])) {
    tags.push("Improvement");
  }

  if (containsAny(text, [
    "safety", "security", "privacy", "compliance", "governance",
    "sensitivity label", "watermark", "data protection", "purview",
    "permission", "policy setting"
  ])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["New feature"];
}

function normaliseCopilotDate(value) {
  const fullDateMatch = String(value || "").match(FULL_DATE_PATTERN);

  if (fullDateMatch) {
    const month = MONTHS[fullDateMatch[1].toLowerCase()];

    return `${fullDateMatch[3]}-${month}-${String(fullDateMatch[2]).padStart(2, "0")}`;
  }

  const monthDateMatch = String(value || "").match(MONTH_DATE_PATTERN);

  if (!monthDateMatch) {
    return "";
  }

  const month = MONTHS[monthDateMatch[1].toLowerCase()];

  // The archive supplies only month and year for some groups. The first day is
  // used as a deterministic sortable value because the app requires YYYY-MM-DD.
  return `${monthDateMatch[2]}-${month}-01`;
}

function buildSourceUrl(sourceUrl, dateHeading) {
  const headingId = dateHeading && dateHeading.attr("id");

  return headingId
    ? `${sourceUrl}#${encodeURIComponent(headingId)}`
    : sourceUrl;
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function firstWords(value, count) {
  return cleanText(value).split(" ").slice(0, count).join(" ");
}

function normaliseIdentity(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function getNodePath(node, ancestor) {
  const path = [];
  let current = node;

  while (current && current !== ancestor) {
    const parent = current.parent;

    if (!parent || !Array.isArray(parent.children)) {
      return [];
    }

    path.unshift(parent.children.indexOf(current));
    current = parent;
  }

  return current === ancestor ? path : [];
}

function resolveNodePath(ancestor, path) {
  let current = ancestor;

  for (const index of path) {
    if (!current || !Array.isArray(current.children) || !current.children[index]) {
      return null;
    }

    current = current.children[index];
  }

  return current;
}

function removeConsecutiveDuplicates(lines) {
  return lines.filter(function (line, index) {
    return line && (index === 0 || line !== lines[index - 1]);
  });
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
