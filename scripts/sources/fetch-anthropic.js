import * as cheerio from "cheerio";

export const ANTHROPIC_CHANGELOG_URL =
  "https://support.claude.com/en/articles/12138966-release-notes";

const DATE_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}$/i;

const MONTH_HEADING_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;

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

    const contentNodes = findReleaseContent($, articleRoot, headingNode);
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

function findReleaseContent($, articleRoot, headingNode) {
  const nodes = [];
  const selectedNodes = new Set();
  const candidates = articleRoot.find("*").toArray();
  const headingIndex = candidates.indexOf(headingNode.get(0));

  if (headingIndex === -1) {
    return nodes;
  }

  for (let index = headingIndex + 1; index < candidates.length; index += 1) {
    const candidateNode = candidates[index];
    const candidate = $(candidateNode);

    if (isDescendantOf(candidateNode, headingNode.get(0))) {
      continue;
    }

    if (isDateHeading($, candidate)) {
      break;
    }

    if (hasSelectedAncestor(candidateNode, selectedNodes)) {
      continue;
    }

    if (candidate.is("script, style, nav, footer, form, button, svg, noscript")) {
      continue;
    }

    const candidateText = cleanText(candidate.attr("data-text") || candidate.text());

    // Month separators and page furniture are not part of a dated update.
    if (candidate.is("h1, h2, h3")) {
      if (MONTH_HEADING_PATTERN.test(candidateText)) {
        continue;
      }

      if (/^(related articles|table of contents|did this answer your question\??)$/i.test(candidateText)) {
        break;
      }

      continue;
    }

    // Never collect a wrapper that also contains a later date heading.
    const containsDateHeading = candidate.find("h2, h3, h4").filter(function () {
      return DATE_PATTERN.test(cleanText($(this).attr("data-text") || $(this).text()));
    }).length > 0;

    if (containsDateHeading) {
      continue;
    }

    if (candidate.is("ul, ol")) {
      if (!candidate.parents("ul, ol").length) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
      }
      continue;
    }

    const className = String(candidate.attr("class") || "").toLowerCase();
    const testId = String(candidate.attr("data-testid") || "").toLowerCase();
    const isIntercomTextBlock =
      className.includes("intercom-interblocks-paragraph") ||
      className.includes("intercom-interblocks-heading") ||
      className.includes("article__body") ||
      testId.includes("paragraph") ||
      testId.includes("heading");

    const isSemanticTextBlock = candidate.is("p, h4, h5, h6, blockquote, pre");

    if ((isIntercomTextBlock || isSemanticTextBlock) && candidateText) {
      nodes.push(candidateNode);
      selectedNodes.add(candidateNode);
      continue;
    }

    // Intercom sometimes renders article lines as plain divs with inline children.
    // Capture those text blocks without depending on a provider-specific class name.
    if (candidate.is("div, section")) {
      const directText = cleanText(
        candidate
          .clone()
          .children()
          .remove()
          .end()
          .text()
      );

      const hasBlockChildren = candidate.children("div, section, p, ul, ol, h1, h2, h3, h4, h5, h6, blockquote").length > 0;

      if ((directText || !hasBlockChildren) && candidateText) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
        continue;
      }
    }

    // Final fallback for title text wrapped only in strong/span elements.
    if (
      candidate.is("strong, b, span") &&
      candidateText &&
      !candidate.parents("p, li, h4, h5, h6, blockquote").length
    ) {
      nodes.push(candidateNode);
      selectedNodes.add(candidateNode);
    }
  }

  return nodes;
}

function isDescendantOf(node, ancestor) {
  let parent = node && node.parent;

  while (parent) {
    if (parent === ancestor) {
      return true;
    }
    parent = parent.parent;
  }

  return false;
}

function hasSelectedAncestor(node, selectedNodes) {
  let parent = node && node.parent;

  while (parent) {
    if (selectedNodes.has(parent)) {
      return true;
    }
    parent = parent.parent;
  }

  return false;
}

function isDateHeading($, node) {
  if (!node.is("h2, h3, h4")) {
    return false;
  }

  return DATE_PATTERN.test(cleanText(node.attr("data-text") || node.text()));
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