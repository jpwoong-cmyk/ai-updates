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

      const metadata = extractDeveloperMetadata($, entryNodes);
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
        tags: classifyDeveloperTags(title, summary, metadata),
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

function extractDeveloperMetadata($, nodes) {
  const metadata = { releaseType: "", endpoints: [], models: [] };
  const endpointNames = new Set();
  const modelNames = new Set();

  // The OpenAI docs markup can vary. Read leaf text nodes rather
  // than depending on a particular class name for OpenAI's type badges.
  for (const node of nodes) {
    const element = $(node);
    if (element.children().length || element.is("script, style, svg, img, button")) {
      continue;
    }
    const value = cleanText(element.attr("data-text") || element.text());
    if (!value || value.length > 120) continue;

    if (!metadata.releaseType && /^(Feature|Update|Fix|Announcement)$/i.test(value)) {
      metadata.releaseType = value.toLowerCase();
    }
    if (/^\/?v\d+\/[\w\-/{}]+$/i.test(value)) endpointNames.add(value);
    if (/^(?:gpt[-\u2010-\u2015]?\d[\w.\-]*|o[134](?:-[\w.\-]+)?|sora(?:-\d+)?|dall[·-]?e[\w.\-]*)$/i.test(value)) {
      modelNames.add(value);
    }
  }

  metadata.endpoints = Array.from(endpointNames);
  metadata.models = Array.from(modelNames);
  return metadata;
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

function classifyDeveloperTags(title, summary, metadata = {}) {
  const sections = developerReleaseSections(title, summary);
  const tags = new Set();
  const type = String(metadata.releaseType || "").toLowerCase();
  const hasEndpoint = Array.isArray(metadata.endpoints) && metadata.endpoints.length > 0;
  const hasModel = Array.isArray(metadata.models) && metadata.models.length > 0;

  // OpenAI supplies its own release type. This outranks free-text inference.
  if (type === "feature") tags.add("New feature");
  if (type === "fix") tags.add("Fixed");
  if (type === "update") tags.add("Improvement");

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

  // Fix is an authoritative classification. A passing "verify fixes" should
  // not cause a Feature entry to be marked as a product bug fix.
  if (type !== "feature" && sections.some(function (section) {
    return /\b(?:fixed|resolved|corrected)\s+(?:(?:an?|the|some|several|multiple)\s+)?(?:bugs?|issues?|errors?|crashes?|regressions?|problems?|failures?)\b|\b(?:bug|issue|crash|regression)\s+fix(?:es)?\b/i.test(section);
  })) {
    tags.add("Fixed");
  }

  // A bug in an endpoint used by GPT-5 is NOT necessarily a model release.
  if (type !== "fix" && (sections.some(isDeveloperModelChange) ||
    (hasModel && /\b(?:new|launched|released|introduced|available|deprecated|retired|updated model|model update)\b/i.test(summary)))) {
    tags.add("Model update");
  }

  // Endpoint badges are structural evidence of API impact, even when
  // the release prose doesn't literally include the word "API".
  if (hasEndpoint || sections.some(function (section) {
    const apiReference = /\b(?:APIs?|SDKs?|endpoints?|webhooks?|response(?:s)? API|chat completions|tool calling|function calling|MCP servers?)\b/i.test(section);
    const apiChange = /\b(?:new|added|support(?:ed|s)?|launched|released|introduced|updated|improved|deprecated|retired|available|enabled|integrat(?:ed|ion))\b/i.test(section);
    return apiReference && apiChange;
  })) {
    tags.add("API");
  }

  if (type !== "feature" && sections.some(function (section) {
    return /\b(?:introducing|introduced|launched|launching|new feature|new capability|now supports?|now available|rolling out|rolled out|you can now|added support for|released|newly available)\b/i.test(section);
  })) {
    tags.add("New feature");
  }

  if (type !== "fix" && sections.some(function (section) {
    return /\b(?:improv(?:ed|ement|ements)|enhanc(?:ed|ement|ements)|(?:made|is|are|now) faster|faster|more reliable|more accurate|redesigned|streamlined|simplified|optimized|optimised|expanded support|increased reliability)\b/i.test(section);
  })) {
    tags.add("Improvement");
  }

  if (sections.some(function (section) {
    const subject = /\b(?:safety|security|privacy|moderation|guardrails?|data protection|security controls?|privacy controls?|prompt injection protections?)\b/i.test(section);
    const change = /\b(?:new|added|introduced|launched|updated|enhanced|improved|protect(?:ion|ions)?|prevent|mitigat(?:ed|ion)|strengthened|controls?|settings|guardrails?)\b/i.test(section);
    return subject && change;
  })) {
    tags.add("Safety");
  }

  // Do not force "API" when the official entry provides no evidence.
  return Array.from(tags);
}

function developerReleaseSections(title, summary) {
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

function isDeveloperModelChange(section) {
  // Retiring a user-facing custom GPT is not retiring a foundation model.
  if (/\bdall[·-]?e\s+gpt\b/i.test(section) && !/\b(?:image generation model|model weights|underlying model)\b/i.test(section)) return false;
  const mentionsModel = /\b(?:models?|gpt[-\u2010-\u2015]?\d[\w.-]*|o[134](?:[-\u2010-\u2015][\w.-]+)?|sora(?:-\d+)?|dall[·-]?e|image generation model|reasoning model|voice model)\b/i.test(section);
  const change = /\b(?:add(?:ed|ing)|introduc(?:ed|ing)|launch(?:ed|ing)|releas(?:ed|ing)|now available|new model|updat(?:ed|ing)|upgrad(?:ed|ing)|improv(?:ed|ing)|retir(?:ed|ing)|deprecat(?:ed|ing)|replac(?:ed|ing)|rolling out|rolled out|faster|more accurate)\b/i.test(section);
  const pickerOnly = /\b(?:model|models)\s+(?:picker|selector|switcher|dropdown|menu|list)\b/i.test(section);
  return mentionsModel && change && !pickerOnly;
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
