import * as cheerio from "cheerio";

export const GEMINI_CHANGELOG_URL = "https://ai.google.dev/gemini-api/docs/changelog";

const DATE_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12"
};

export async function fetchGeminiChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(GEMINI_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mini-AI-Encyclopedia/1.0 (scheduled public changelog reader)"
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini changelog request failed with HTTP ${response.status}.`);
  }

  const html = await response.text();
  return parseGeminiChangelog(html);
}

export function parseGeminiChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Gemini changelog HTML was empty.");
  }

  const $ = cheerio.load(html);
  const headingNodes = findDateHeadings($);

  if (!headingNodes.length) {
    throw new Error("No Gemini release-date headings were found. The source markup may have changed.");
  }

  const entriesByDate = new Map();

  headingNodes.each(function () {
    const headingNode = $(this);
    const headingText = cleanText(headingNode.text());
    const date = normaliseDate(headingText);

    if (!date) {
      return;
    }

    const headingContainer = getHeadingContainer($, headingNode);
    const releaseList = findReleaseList($, headingContainer);

    if (!releaseList || !releaseList.length) {
      return;
    }

    const summary = formatListAsText($, releaseList);

    if (!summary) {
      return;
    }

    const title = firstWords(summary, 5);
    const sourceUrl = buildSourceUrl(headingContainer);

    const entry = {
      id: `gemini-${date}`,
      providerId: "gemini",
      providerName: "Google",
      product: "Gemini",
      title,
      date,
      summary,
      tags: ["API"],
      sourceUrl
    };

    if (entriesByDate.has(date)) {
      const existing = entriesByDate.get(date);
      existing.summary = `${existing.summary}\n${summary}`;
      existing.title = firstWords(existing.summary, 5);
      return;
    }

    entriesByDate.set(date, entry);
  });

  const entries = Array.from(entriesByDate.values()).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!entries.length) {
    throw new Error("Gemini release headings were found, but no matching release lists could be extracted.");
  }

  return entries;
}

function findDateHeadings($) {
  const devsiteHeadings = $("span.devsite-heading").filter(function () {
    return DATE_PATTERN.test(cleanText($(this).text()));
  });

  if (devsiteHeadings.length) {
    return devsiteHeadings;
  }

  return $("h2, h3").filter(function () {
    return DATE_PATTERN.test(cleanText($(this).text()));
  });
}

function getHeadingContainer($, headingNode) {
  if (headingNode.is("h2, h3")) {
    return headingNode;
  }

  const closestHeading = headingNode.closest("h2, h3");
  return closestHeading.length ? closestHeading : headingNode.parent();
}

function findReleaseList($, headingContainer) {
  let cursor = headingContainer.next();

  while (cursor.length) {
    if (cursor.is("h2, h3")) {
      break;
    }

    if (cursor.is("ul")) {
      return cursor.first();
    }

    const nestedList = cursor.children("ul").first();
    if (nestedList.length) {
      return nestedList;
    }

    cursor = cursor.next();
  }

  return null;
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
  const match = value.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);

  if (!match || !MONTHS[match[1]]) {
    return "";
  }

  return `${match[3]}-${MONTHS[match[1]]}-${String(match[2]).padStart(2, "0")}`;
}

function buildSourceUrl(headingContainer) {
  const headingId = headingContainer.attr("id");
  return headingId ? `${GEMINI_CHANGELOG_URL}#${encodeURIComponent(headingId)}` : GEMINI_CHANGELOG_URL;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
