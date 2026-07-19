import * as cheerio from "cheerio";

export const OPENAI_DEVELOPER_CHANGELOG_URL =
  "https://developers.openai.com/api/docs/changelog";

const MONTH_HEADING_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December),\s+(\d{4})$/i;

const SHORT_DATE_PATTERN =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})$/i;

const MONTHS = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

export async function fetchOpenAIDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(OPENAI_DEVELOPER_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI developer changelog request failed with HTTP ${response.status}.`
    );
  }

  return parseOpenAIDeveloperChangelog(await response.text());
}

export function parseOpenAIDeveloperChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("OpenAI developer changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const allNodes = articleRoot.find("*").toArray();
  const monthHeadings = findMonthHeadings($, articleRoot).toArray();

  if (!monthHeadings.length) {
    throw new Error(
      "No OpenAI API changelog month headings were found. OpenAI may have changed the page markup."
    );
  }

  const entries = [];

  monthHeadings.forEach(function (monthHeading, monthIndex) {
    const monthText = cleanText($(monthHeading).text());
    const monthMatch = monthText.match(MONTH_HEADING_PATTERN);

    if (!monthMatch) {
      return;
    }

    const year = monthMatch[2];
    const startIndex = allNodes.indexOf(monthHeading);
    const nextMonthHeading = monthHeadings[monthIndex + 1];
    const endIndex = nextMonthHeading
      ? allNodes.indexOf(nextMonthHeading)
      : allNodes.length;

    if (startIndex < 0 || endIndex <= startIndex) {
      return;
    }

    const sectionNodes = allNodes.slice(startIndex + 1, endIndex);
    const dateNodes = sectionNodes.filter(function (node) {
      const element = $(node);
      const text = cleanText(element.attr("datetime") || element.text());

      if (!SHORT_DATE_PATTERN.test(text)) {
        return false;
      }

      return !element
        .find("*")
        .toArray()
        .some(function (child) {
          const childElement = $(child);
          return SHORT_DATE_PATTERN.test(
            cleanText(childElement.attr("datetime") || childElement.text())
          );
        });
    });

    dateNodes.forEach(function (dateNode, dateIndex) {
      const dateText = cleanText(
        $(dateNode).attr("datetime") || $(dateNode).text()
      );
      const date = normaliseShortDate(dateText, year);

      if (!date) {
        return;
      }

      const entryStart = sectionNodes.indexOf(dateNode);
      const nextDateNode = dateNodes[dateIndex + 1];
      const entryEnd = nextDateNode
        ? sectionNodes.indexOf(nextDateNode)
        : sectionNodes.length;
      const entryNodes = sectionNodes.slice(entryStart + 1, entryEnd);
      const summary = formatEntryContent($, entryNodes);

      if (!summary) {
        return;
      }

      const title = createTitle(summary);
      const sourceUrl = buildSourceUrl($(dateNode), $(monthHeading));

      entries.push({
        id: `openai-developer-${date}-${slugify(title)}`,
        providerId: "openai",
        providerName: "OpenAI",
        product: "OpenAI Platform",
        audience: "developer",
        title,
        date,
        datePrecision: "day",
        summary,
        tags: classifyDeveloperTags(title, summary),
        sourceUrl
      });
    });
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "OpenAI API month headings were found, but no dated changelog entries could be extracted."
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

    if (match.length && findMonthHeadings($, match).length) {
      return match;
    }
  }

  return $.root();
}

function findMonthHeadings($, root) {
  return root.find("h2, h3").filter(function () {
    return MONTH_HEADING_PATTERN.test(cleanText($(this).text()));
  });
}

function formatEntryContent($, nodes) {
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

    const text = cleanText(element.text());

    if (!text || isOpenAIMetadataOnly(text)) {
      return;
    }

    if (element.is("ul, ol")) {
      if (!element.parents("ul, ol").length) {
        const formatted = formatListAsText($, element);
        if (formatted) {
          blocks.push(formatted);
          selected.add(node);
        }
      }
      return;
    }

    if (element.is("table")) {
      const formatted = formatTableAsText($, element);
      if (formatted) {
        blocks.push(formatted);
        selected.add(node);
      }
      return;
    }

    if (element.is("p, blockquote, pre")) {
      blocks.push(text);
      selected.add(node);
      return;
    }

    if (element.is("div, section")) {
      const directText = cleanText(
        element.clone().children().remove().end().text()
      );
      const hasBlockChildren =
        element.children("div, section, p, ul, ol, table, blockquote, pre").length > 0;

      if (directText && !isOpenAIMetadataOnly(directText)) {
        blocks.push(directText);
        selected.add(node);
      } else if (!hasBlockChildren && text.length >= 30) {
        blocks.push(text);
        selected.add(node);
      }
    }
  });

  return removeConsecutiveDuplicates(blocks).join("\n\n").trim();
}

function isOpenAIMetadataOnly(text) {
  if (/^(Feature|Update|Fix|Announcement)$/i.test(text)) {
    return true;
  }

  if (/^v\d+\//i.test(text)) {
    return true;
  }

  if (/^[a-z0-9._/-]+$/i.test(text) && text.length < 80) {
    return true;
  }

  return false;
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

function normaliseShortDate(value, year) {
  const match = String(value || "").match(SHORT_DATE_PATTERN);
  if (!match) {
    return "";
  }

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) {
    return "";
  }

  return `${year}-${month}-${String(match[2]).padStart(2, "0")}`;
}

function createTitle(summary) {
  const plain = String(summary || "")
    .replace(/^[\s•–—-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentence = plain.split(/(?<=[.!?])\s+/)[0] || plain;
  return firstWords(sentence, 10);
}

function classifyDeveloperTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "sunset", "retired", "removed", "discontinued"])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, ["pricing", "price", "billing", "cost", "charged", "discount"])) {
    tags.push("Pricing");
  }

  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue", "reliability", "stability"])) {
    tags.push("Fixed");
  }

  if (containsAny(text, ["model", "gpt-", "realtime", "embedding", "sora", "image model"])) {
    tags.push("Model update");
  }

  if (containsAny(text, ["api", "sdk", "endpoint", "responses", "chat completions", "batch", "webhook", "tool calling", "mcp"])) {
    tags.push("API");
  }

  if (containsAny(text, ["released", "launch", "launched", "introduced", "added", "now available", "support for"])) {
    tags.push("New feature");
  }

  if (containsAny(text, ["updated", "improved", "enhanced", "expanded", "faster", "increased", "redesigned"])) {
    tags.push("Improvement");
  }

  if (containsAny(text, ["safety", "security", "moderation", "privacy", "compliance", "identity federation"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["API"];
}

function buildSourceUrl(dateNode, monthHeading) {
  const id = firstText(
    dateNode.attr("id"),
    dateNode.closest("[id]").attr("id"),
    monthHeading.attr("id")
  );

  return id
    ? `${OPENAI_DEVELOPER_CHANGELOG_URL}#${encodeURIComponent(id)}`
    : OPENAI_DEVELOPER_CHANGELOG_URL;
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

function firstText() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
