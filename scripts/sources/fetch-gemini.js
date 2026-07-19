import * as cheerio from "cheerio";

export const GEMINI_CHANGELOG_URL = "https://gemini.google/release-notes/";

const DATE_PATTERN = /^(\d{4})[.-](\d{2})[.-](\d{2})$/;

export async function fetchGeminiChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(GEMINI_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Gemini product release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseGeminiChangelog(await response.text());
}

export function parseGeminiChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Gemini product release-notes HTML was empty.");
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const headings = articleRoot.find("h2, h3").toArray();
  const dateHeadings = headings.filter(function (node) {
    return Boolean(normaliseDate(cleanText($(node).text())));
  });

  if (!dateHeadings.length) {
    throw new Error(
      "No Gemini product release-date headings were found. Google may have changed the page markup."
    );
  }

  const entries = [];
  let activeDate = "";

  headings.forEach(function (node) {
    const heading = $(node);
    const headingText = cleanText(heading.text());
    const headingDate = normaliseDate(headingText);

    if (headingDate) {
      activeDate = headingDate;
      return;
    }

    // A non-date H2 ends the current dated release group.
    if (heading.is("h2")) {
      activeDate = "";
      return;
    }

    if (!activeDate || !heading.is("h3") || !headingText) {
      return;
    }

    const contentNodes = findReleaseContent($, articleRoot, heading);
    const summary = formatReleaseContent($, contentNodes);

    if (!summary) {
      return;
    }

    entries.push({
      id: `gemini-${activeDate}-${slugify(headingText)}`,
      providerId: "gemini",
      providerName: "Google",
      product: "Gemini",
      title: headingText,
      date: activeDate,
      summary,
      tags: classifyGeminiTags(headingText, summary),
      sourceUrl: buildSourceUrl(heading)
    });
  });

  const uniqueEntries = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!uniqueEntries.length) {
    throw new Error(
      "Gemini product release-date headings were found, but no titled release entries could be extracted."
    );
  }

  return uniqueEntries;
}

function findArticleRoot($) {
  const selectors = [
    "main",
    "article",
    "[role='main']"
  ];

  for (const selector of selectors) {
    const candidates = $(selector).toArray();

    for (const candidate of candidates) {
      const root = $(candidate);
      const hasReleaseTitle = root
        .find("h1")
        .toArray()
        .some(function (heading) {
          return /^release notes$/i.test(cleanText($(heading).text()));
        });

      const hasDates = root
        .find("h2")
        .toArray()
        .some(function (heading) {
          return Boolean(normaliseDate(cleanText($(heading).text())));
        });

      if (hasReleaseTitle && hasDates) {
        return root;
      }
    }
  }

  const fallback = $("main").first();
  return fallback.length ? fallback : $.root();
}

function findReleaseContent($, articleRoot, releaseHeading) {
  const nodes = [];
  const selectedNodes = new Set();
  const candidates = articleRoot.find("*").toArray();
  const headingElement = releaseHeading.get(0);
  const headingIndex = candidates.indexOf(headingElement);

  if (headingIndex === -1) {
    return nodes;
  }

  for (let index = headingIndex + 1; index < candidates.length; index += 1) {
    const candidateNode = candidates[index];
    const candidate = $(candidateNode);

    if (isDescendantOf(candidateNode, headingElement)) {
      continue;
    }

    // Every H2 date and every H3 title starts a new release boundary.
    if (candidate.is("h2, h3")) {
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

    const candidateText = cleanText(candidate.text());

    if (!candidateText) {
      continue;
    }

    // Avoid collecting wrappers that also contain the next release heading.
    if (candidate.find("h2, h3").length) {
      continue;
    }

    if (candidate.is("ul, ol")) {
      if (!candidate.parents("ul, ol").length) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
      }
      continue;
    }

    if (candidate.is("p, blockquote, pre")) {
      nodes.push(candidateNode);
      selectedNodes.add(candidateNode);
      continue;
    }

    // Google may wrap release prose in plain divs or sections.
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
          "div, section, p, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre"
        ).length > 0;

      if ((directText || !hasBlockChildren) && candidateText) {
        nodes.push(candidateNode);
        selectedNodes.add(candidateNode);
      }
    }
  }

  return nodes;
}

function formatReleaseContent($, nodes) {
  const blocks = [];

  nodes.forEach(function (node) {
    const element = $(node);

    if (element.is("ul, ol")) {
      const listText = formatListAsText($, element);

      if (listText) {
        blocks.push(listText);
      }
      return;
    }

    const text = cleanText(element.text());

    if (text) {
      blocks.push(text);
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
      const nestedText = formatListAsText($, $(this), depth + 1);

      if (nestedText) {
        lines.push(nestedText);
      }
    });
  });

  return lines.join("\n").trim();
}

function classifyGeminiTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (
    containsAny(text, [
      "deprecated",
      "deprecation",
      "sunset",
      "retired",
      "retiring",
      "discontinued",
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
      "plan"
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
      "reliability"
    ])
  ) {
    tags.push("Fixed");
  }

  if (
    containsAny(text, [
      "model",
      "gemini 2",
      "gemini 3",
      "flash",
      "pro",
      "deep think",
      "imagen",
      "veo",
      "nano banana"
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
      "function calling"
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
      "starting today",
      "rolling out",
      "coming to",
      "you can now",
      "added",
      "create",
      "meet your"
    ])
  ) {
    tags.push("New feature");
  }

  if (
    containsAny(text, [
      "improved",
      "improvement",
      "enhanced",
      "upgrade",
      "upgraded",
      "richer",
      "faster",
      "better",
      "expanded",
      "more helpful"
    ])
  ) {
    tags.push("Improvement");
  }

  if (
    containsAny(text, [
      "safety",
      "security",
      "privacy",
      "private",
      "responsible ai",
      "data protection"
    ])
  ) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["New feature"];
}

function deduplicateEntries(entries) {
  const entriesByKey = new Map();

  entries.forEach(function (entry) {
    const key = `${entry.date}|${slugify(entry.title)}`;
    const existing = entriesByKey.get(key);

    if (!existing || entry.summary.length > existing.summary.length) {
      entriesByKey.set(key, entry);
    }
  });

  return Array.from(entriesByKey.values());
}

function normaliseDate(value) {
  const match = cleanText(value).match(DATE_PATTERN);

  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function buildSourceUrl(heading) {
  const headingId = heading.attr("id") || heading.closest("[id]").attr("id");

  if (headingId) {
    return `${GEMINI_CHANGELOG_URL}#${encodeURIComponent(headingId)}`;
  }

  const localLink = heading.find("a[href^='#']").first().attr("href");

  if (localLink) {
    return new URL(localLink, GEMINI_CHANGELOG_URL).toString();
  }

  return GEMINI_CHANGELOG_URL;
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "update";
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
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
