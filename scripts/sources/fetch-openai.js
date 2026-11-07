import * as cheerio from "cheerio";

export const OPENAI_CHANGELOG_URL =
  "https://help.openai.com/en/articles/6825453-chatgpt-release-notes";

/*
 * The Help Center sometimes rejects obvious server-side scraper requests.
 * Its .json-suffixed route still serves the official article HTML, but through
 * a route that is friendlier to automated document retrieval.
 */
const OPENAI_FETCH_URLS = [
  `${OPENAI_CHANGELOG_URL}.json`,
  OPENAI_CHANGELOG_URL
];

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

  const requestHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "https://help.openai.com/",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/131.0.0.0 Safari/537.36"
  };

  const failures = [];

  for (const url of OPENAI_FETCH_URLS) {
    const response = await fetchImpl(url, {
      headers: requestHeaders,
      redirect: "follow"
    });

    if (response.ok) {
      return parseOpenAIChangelog(await response.text());
    }

    failures.push(`${url} returned HTTP ${response.status}`);
  }

  throw new Error(
    `OpenAI Help Center blocked the server-side request. ${failures.join("; ")}`
  );
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
  const sections = releaseSections(title, summary);
  const tags = new Set();

  // Require an actual change, rather than merely mentioning a term.
  if (sections.some(function (section) {
    return /\b(?:deprecat(?:ed|ion|ing)|sunset(?:ting)?|retir(?:ed|ing|ement)|discontinu(?:ed|ing)|no longer available|end of support)\b/i.test(section);
  })) {
    tags.add("Deprecated");
  }

  if (sections.some(function (section) {
    return /\b(?:new pricing|pricing changes?|pricing updates?|price (?:increase|decrease|reduction|cut|change)|prices? (?:have )?(?:increased|decreased|changed|reduced)|reduced (?:prices?|costs?|rates?)|(?:billing|subscription) rates? (?:changed|increased|decreased)|(?:lower|higher) (?:prices?|rates?))\b/i.test(section);
  })) {
    tags.add("Pricing");
  }

  if (sections.some(function (section) {
    return /\b(?:fixed|resolved|corrected)\s+(?:(?:an?|the|some|several|multiple)\s+)?(?:bugs?|issues?|errors?|crashes?|regressions?|problems?|failures?)\b|\b(?:bug|issue|crash|regression)\s+fix(?:es)?\b|\bfix(?:ed|es)?\s+(?:a|the)\s+(?:bug|issue|crash|regression)\b/i.test(section);
  })) {
    tags.add("Fixed");
  }

  if (sections.some(isModelReleaseChange)) {
    tags.add("Model update");
  }

  if (sections.some(function (section) {
    const hasDeveloperInterface = /\b(?:APIs?|SDKs?|endpoints?|webhooks?|tool calling|function calling)\b/i.test(section);
    const change = /\b(?:new|added|adding|support(?:ed|s)?|launched|released|introduced|updated|changed|improved|deprecated|retired|available|integrat(?:ed|ion))\b/i.test(section);
    // A passing reference to API credits or an API limitation isn't an API release.
    return hasDeveloperInterface && change &&
      !/^.*\b(?:not (?:included|available|supported)|does not include)\b.*\bAPI\b/i.test(section);
  })) {
    tags.add("API");
  }

  if (sections.some(function (section) {
    return /\b(?:introducing|introduced|launched|launching|new feature|new capability|now supports?|now available|rolling out|rolled out|you can now|added support for|newly available)\b/i.test(section);
  })) {
    tags.add("New feature");
  }

  if (sections.some(function (section) {
    return /\b(?:improv(?:ed|ement|ements)|enhanc(?:ed|ement|ements)|(?:made|is|are|now) faster|faster|more reliable|more accurate|redesigned|streamlined|simplified|optimized|optimised|expanded support|increased reliability)\b/i.test(section);
  })) {
    tags.add("Improvement");
  }

  if (sections.some(isSafetyChange)) {
    tags.add("Safety");
  }

  // No forced "New feature" fallback. Empty tags are displayed as "Update"
  // by app.js and remain available under the "All changes" filter.
  return Array.from(tags);
}

function releaseSections(title, summary) {
  const sections = String(summary || "")
    .split(/\n\s*\n/)
    .map(function (value) { return value.replace(/\s+/g, " ").trim(); })
    .filter(Boolean);
  const heading = String(title || "").trim();
  if (heading && !sections.some(function (part) { return part.startsWith(heading); })) {
    sections.unshift(heading);
  }
  return sections;
}

function isModelReleaseChange(section) {
  // Retiring a user-facing custom GPT is not retiring a foundation model.
  if (/\bdall[·-]?e\s+gpt\b/i.test(section) && !/\b(?:image generation model|model weights|underlying model)\b/i.test(section)) return false;
  const mentionsModel = /\b(?:models?|gpt[-\u2010-\u2015]?\d[\w.-]*|o[134](?:[-\u2010-\u2015][\w.-]+)?|sora(?:-\d+)?|dall[·-]?e|image generation model|reasoning model|voice model)\b/i.test(section);
  const actualChange = /\b(?:add(?:ed|ing)|introduc(?:ed|ing)|launch(?:ed|ing)|releas(?:ed|ing)|now available|new model|updat(?:ed|ing)|upgrad(?:ed|ing)|improv(?:ed|ing)|retir(?:ed|ing)|deprecat(?:ed|ing)|replac(?:ed|ing)|rolling out|rolled out|faster|more accurate)\b/i.test(section);
  const pickerOnly = /\b(?:model|models)\s+(?:picker|selector|switcher|dropdown|menu|list)\b/i.test(section);
  return mentionsModel && actualChange && !pickerOnly;
}

function isSafetyChange(section) {
  const protection = /\b(?:safety|security|privacy|moderation|guardrails?|data protection|security controls?|privacy controls?|prompt injection protections?)\b/i.test(section);
  const change = /\b(?:new|added|introduced|launched|updated|enhanced|improved|protect(?:ion|ions)?|prevent|mitigat(?:ed|ion)|strengthened|controls?|settings|guardrails?)\b/i.test(section);
  return protection && change;
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