import * as cheerio from "cheerio";

export const OPENAI_CHANGELOG_URL =
  "https://help.openai.com/en/articles/6825453-chatgpt-release-notes";

const DATE_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}$/i;

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

export async function fetchOpenAIChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(OPENAI_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.1 (+https://vercel.com)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI changelog request failed with HTTP ${response.status}.`
    );
  }

  return parseOpenAIChangelog(await response.text());
}

export function parseOpenAIChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("OpenAI changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const headingNodes = findDateHeadings($, articleRoot);

  if (!headingNodes.length) {
    throw new Error(
      "No ChatGPT release-date headings were found. OpenAI may have changed the page markup."
    );
  }

  const entriesByDate = new Map();

  headingNodes.each(function () {
    const headingNode = $(this);
    const dateText = cleanText(
      headingNode.attr("data-text") || headingNode.text()
    );
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
      id: `openai-${date}`,
      providerId: "openai",
      providerName: "OpenAI",
      product: "ChatGPT",
      title,
      date,
      summary,
      tags: classifyOpenAITags(title, summary),
      sourceUrl: buildSourceUrl(headingNode)
    };

    if (entriesByDate.has(date)) {
      const existing = entriesByDate.get(date);
      existing.summary = `${existing.summary}\n\n${summary}`;
      existing.title = firstWords(existing.summary, 5);
      existing.tags = classifyOpenAITags(
        existing.title,
        existing.summary
      );
      return;
    }

    entriesByDate.set(date, entry);
  });

  const entries = Array.from(entriesByDate.values()).sort(function (
    first,
    second
  ) {
    return second.date.localeCompare(first.date);
  });

  if (!entries.length) {
    throw new Error(
      "ChatGPT date headings were found, but their release-note content could not be extracted."
    );
  }

  return entries;
}

function findArticleRoot($) {
  const selectors = [
    "[data-testid='article-body']",
    ".article__body",
    ".intercom-interblocks",
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
  return root
    .find("h1, h2, h3, h4, [role='heading']")
    .filter(function () {
      const heading = $(this);
      const candidate = cleanText(
        heading.attr("data-text") || heading.text()
      );

      return DATE_PATTERN.test(candidate);
    });
}

function findReleaseContent($, articleRoot, headingNode) {
  const nodes = [];
  const selectedNodes = new Set();
  const candidates = articleRoot.find("*").toArray();
  const headingElement = headingNode.get(0);
  const headingIndex = candidates.indexOf(headingElement);

  if (headingIndex === -1) {
    return nodes;
  }

  for (
    let index = headingIndex + 1;
    index < candidates.length;
    index += 1
  ) {
    const candidateNode = candidates[index];
    const candidate = $(candidateNode);

    if (isDescendantOf(candidateNode, headingElement)) {
      continue;
    }

    if (isDateHeading($, candidate)) {
      break;
    }

    if (hasSelectedAncestor(candidateNode, selectedNodes)) {
      continue;
    }

    if (
      candidate.is(
        "script, style, nav, footer, form, button, svg, noscript, img, picture, video"
      )
    ) {
      continue;
    }

    const candidateText = cleanText(
      candidate.attr("data-text") || candidate.text()
    );

    if (!candidateText) {
      continue;
    }

    if (candidate.is("h1")) {
      continue;
    }

    if (
      /^(related articles|table of contents|did this answer your question\??)$/i.test(
        candidateText
      )
    ) {
      break;
    }

    const containsDateHeading =
      candidate
        .find("h1, h2, h3, h4, [role='heading']")
        .filter(function () {
          const nested = $(this);
          return DATE_PATTERN.test(
            cleanText(nested.attr("data-text") || nested.text())
          );
        }).length > 0;

    if (containsDateHeading) {
      continue;
    }

    if (candidate.is("ul, ol, table")) {
      if (!candidate.parents("ul, ol, table").length) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
      }
      continue;
    }

    const className = String(
      candidate.attr("class") || ""
    ).toLowerCase();

    const testId = String(
      candidate.attr("data-testid") || ""
    ).toLowerCase();

    const isHelpCenterTextBlock =
      className.includes("intercom-interblocks-paragraph") ||
      className.includes("intercom-interblocks-heading") ||
      className.includes("article__body") ||
      testId.includes("paragraph") ||
      testId.includes("heading");

    const isSemanticTextBlock = candidate.is(
      "p, h2, h3, h4, h5, h6, blockquote, pre"
    );

    if (
      (isHelpCenterTextBlock || isSemanticTextBlock) &&
      candidateText
    ) {
      nodes.push(candidateNode);
      selectedNodes.add(candidateNode);
      continue;
    }

    if (candidate.is("div, section")) {
      const directText = cleanText(
        candidate
          .clone()
          .children()
          .remove()
          .end()
          .text()
      );

      const hasBlockChildren =
        candidate.children(
          "div, section, p, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, pre"
        ).length > 0;

      if ((directText || !hasBlockChildren) && candidateText) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
        continue;
      }
    }

    if (
      candidate.is("strong, b, span") &&
      candidateText &&
      !candidate.parents(
        "p, li, h2, h3, h4, h5, h6, blockquote, td, th"
      ).length
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
  if (!node.is("h1, h2, h3, h4, [role='heading']")) {
    return false;
  }

  return DATE_PATTERN.test(
    cleanText(node.attr("data-text") || node.text())
  );
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

    if (element.is("table")) {
      const tableText = formatTableAsText($, element);

      if (tableText) {
        lines.push(tableText);
      }

      return;
    }

    const text = cleanText(element.text());

    if (text) {
      lines.push(text);
    }
  });

  return removeConsecutiveDuplicates(lines)
    .join("\n\n")
    .trim();
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
      const nestedText = formatListAsText(
        $,
        $(this),
        depth + 1
      );

      if (nestedText) {
        lines.push(nestedText);
      }
    });
  });

  return lines.join("\n").trim();
}

function formatTableAsText($, table) {
  const rows = [];

  table.find("tr").each(function () {
    const cells = $(this)
      .children("th, td")
      .map(function () {
        return cleanText($(this).text());
      })
      .get()
      .filter(Boolean);

    if (cells.length) {
      rows.push(`• ${cells.join(" | ")}`);
    }
  });

  return rows.join("\n").trim();
}

function classifyOpenAITags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (
    containsAny(text, [
      "deprecated",
      "deprecation",
      "sunset",
      "retired",
      "retiring",
      "retirement",
      "removed",
      "discontinued",
      "end of support",
      "no longer available"
    ])
  ) {
    tags.push("Deprecated");
  }

  if (
    containsAny(text, [
      "pricing",
      "price",
      "billing",
      "cost",
      "subscription",
      "plan limit",
      "usage limit"
    ])
  ) {
    tags.push("Pricing");
  }

  if (
    containsAny(text, [
      "fixed",
      "fix",
      "bug",
      "resolved",
      "issue",
      "reliability",
      "stability"
    ])
  ) {
    tags.push("Fixed");
  }

  if (
    containsAny(text, [
      "model",
      "gpt-",
      "gpt ",
      "o1",
      "o3",
      "o4",
      "voice model",
      "reasoning"
    ])
  ) {
    tags.push("Model update");
  }

  if (
    containsAny(text, [
      "api",
      "sdk",
      "developer",
      "endpoint",
      "function calling",
      "structured output",
      "token",
      "codex"
    ])
  ) {
    tags.push("API");
  }

  if (
    containsAny(text, [
      "introducing",
      "introduced",
      "launch",
      "launched",
      "new ",
      "now available",
      "rolling out",
      "added",
      "support for"
    ])
  ) {
    tags.push("New feature");
  }

  if (
    containsAny(text, [
      "improved",
      "improvement",
      "enhanced",
      "expanded",
      "faster",
      "updated",
      "upgrade",
      "upgraded",
      "simplified"
    ])
  ) {
    tags.push("Improvement");
  }

  if (
    containsAny(text, [
      "safety",
      "security",
      "privacy",
      "compliance",
      "lockdown mode",
      "prompt injection",
      "data protection"
    ])
  ) {
    tags.push("Safety");
  }

  return tags.length
    ? Array.from(new Set(tags))
    : ["New feature"];
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

  const month = match
    ? MONTHS[match[1].toLowerCase()]
    : "";

  if (!match || !month) {
    return "";
  }

  return `${match[3]}-${month}-${String(match[2]).padStart(
    2,
    "0"
  )}`;
}

function buildSourceUrl(headingNode) {
  const headingId = headingNode.attr("id");

  return headingId
    ? `${OPENAI_CHANGELOG_URL}#${encodeURIComponent(headingId)}`
    : OPENAI_CHANGELOG_URL;
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
