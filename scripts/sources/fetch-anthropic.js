import * as cheerio from "cheerio";

export const ANTHROPIC_CHANGELOG_URL =
  "https://support.claude.com/en/articles/12138966-release-notes";

const DATE_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}$/i;

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

export async function fetchAnthropicChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(ANTHROPIC_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.1 (+https://vercel.com)"
    }
  });

  if (!response.ok) {
    throw new Error(`Anthropic changelog request failed with HTTP ${response.status}.`);
  }

  return parseAnthropicChangelog(await response.text());
}

export function parseAnthropicChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Anthropic changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const headingNodes = findDateHeadings($, articleRoot);

  if (!headingNodes.length) {
    throw new Error(
      "No Anthropic release-date headings were found. Anthropic may have changed the page markup."
    );
  }

  const entriesByDate = new Map();

  headingNodes.each(function () {
    const headingNode = $(this);
    const dateText = cleanText(headingNode.attr("data-text") || headingNode.text());
    const date = normaliseDate(dateText);

    if (!date) {
      return;
    }

    const contentNodes = findReleaseContent($, headingNode);
    const summary = formatReleaseContent($, contentNodes);

    if (!summary) {
      return;
    }

    const title = firstWords(summary, 5);
    const entry = {
      id: `anthropic-${date}`,
      providerId: "anthropic",
      providerName: "Anthropic",
      product: "Claude",
      title,
      date,
      summary,
      tags: classifyAnthropicTags(title, summary),
      sourceUrl: buildSourceUrl(headingNode)
    };

    if (entriesByDate.has(date)) {
      const existing = entriesByDate.get(date);
      existing.summary = `${existing.summary}\n\n${summary}`;
      existing.title = firstWords(existing.summary, 5);
      existing.tags = classifyAnthropicTags(existing.title, existing.summary);
      return;
    }

    entriesByDate.set(date, entry);
  });

  const entries = Array.from(entriesByDate.values()).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!entries.length) {
    throw new Error(
      "Anthropic date headings were found, but their release-note content could not be extracted."
    );
  }

  return entries;
}

function findArticleRoot($) {
  const selectors = [
    "[data-testid='article-body']",
    ".article__body",
    ".intercom-interblocks",
    "article"
  ];

  for (const selector of selectors) {
    const match = $(selector).first();
    if (match.length && findDateHeadings($, match).length) {
      return match;
    }
  }

  const main = $("main").first();
  return main.length ? main : $.root();
}

function findDateHeadings($, root) {
  return root.find("h2, h3, h4").filter(function () {
    const heading = $(this);
    const candidate = cleanText(heading.attr("data-text") || heading.text());
    return DATE_PATTERN.test(candidate);
  });
}

function findReleaseContent($, headingNode) {
  const nodes = [];
  let cursor = headingNode.next();

  while (cursor.length) {
    if (isDateHeading($, cursor)) {
      break;
    }

    collectMeaningfulNodes($, cursor, nodes);
    cursor = cursor.next();
  }

  return nodes;
}

function isDateHeading($, node) {
  if (!node.is("h2, h3, h4")) {
    return false;
  }

  return DATE_PATTERN.test(cleanText(node.attr("data-text") || node.text()));
}

function collectMeaningfulNodes($, node, output) {
  if (node.is("script, style, nav, footer, form, button")) {
    return;
  }

  if (node.is("h2, h3") && !isDateHeading($, node)) {
    return;
  }

  if (node.is("p, h4, h5, h6, ul, ol, blockquote")) {
    output.push(node.get(0));
    return;
  }

  node.children().each(function () {
    collectMeaningfulNodes($, $(this), output);
  });
}

function formatReleaseContent($, nodes) {
  const lines = [];

  nodes.forEach(function (node) {
    const element = $(node);

    if (element.is("ul, ol")) {
      const listText = formatListAsText($, element);
      if (listText) {
        lines.push(listText);
      }
      return;
    }

    const text = cleanText(element.text());
    if (text) {
      lines.push(text);
    }
  });

  return removeConsecutiveDuplicates(lines).join("\n\n").trim();
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
      const nestedText = formatListAsText($, $(this), depth + 1);
      if (nestedText) {
        lines.push(nestedText);
      }
    });
  });

  return lines.join("\n").trim();
}

function classifyAnthropicTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, [
    "deprecated", "deprecation", "sunset", "retired", "retirement",
    "removed", "discontinued", "end of support"
  ])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, [
    "pricing", "price", "billing", "cost", "plan", "subscription", "seat"
  ])) {
    tags.push("Pricing");
  }

  if (containsAny(text, [
    "fixed", "fix", "bug", "resolved", "issue", "reliability"
  ])) {
    tags.push("Fixed");
  }

  if (containsAny(text, [
    "model", "opus", "sonnet", "haiku", "context window"
  ])) {
    tags.push("Model update");
  }

  if (containsAny(text, [
    "api", "sdk", "developer", "console", "endpoint", "tool use",
    "prompt caching", "token"
  ])) {
    tags.push("API");
  }

  if (containsAny(text, [
    "launch", "launched", "introducing", "introduced", "new ",
    "now available", "available to", "added", "support for"
  ])) {
    tags.push("New feature");
  }

  if (containsAny(text, [
    "improved", "improvement", "enhanced", "expanded", "faster",
    "updated", "upgrade", "upgraded"
  ])) {
    tags.push("Improvement");
  }

  if (containsAny(text, [
    "safety", "security", "responsible", "compliance", "hipaa",
    "privacy", "protected health information"
  ])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["New feature"];
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function firstWords(value, count) {
  return value
    .replace(/^[\s•–—-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, count)
    .join(" ");
}

function normaliseDate(value) {
  const match = String(value || "").match(
    /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i
  );

  const month = match ? MONTHS[match[1].toLowerCase()] : "";
  if (!match || !month) {
    return "";
  }

  return `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}`;
}

function buildSourceUrl(headingNode) {
  const headingId = headingNode.attr("id");
  return headingId
    ? `${ANTHROPIC_CHANGELOG_URL}#${encodeURIComponent(headingId)}`
    : ANTHROPIC_CHANGELOG_URL;
}

function removeConsecutiveDuplicates(lines) {
  return lines.filter(function (line, index) {
    return index === 0 || line !== lines[index - 1];
  });
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
