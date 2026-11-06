import * as cheerio from "cheerio";

export const GEMINI_DEVELOPER_CHANGELOG_URL =
  "https://ai.google.dev/gemini-api/docs/changelog?hl=en";

const MONTHS = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12"
};

const ENGLISH_DATE_PATTERN =
  /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;

const ISO_DATE_PATTERN = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;

// The Google AI Studio documentation site can return an app shell without
// server-rendered release entries. This read-only HTML mirror is a fallback,
// NOT the canonical source. Entry links always point to Google's official page.
export const GEMINI_DEVELOPER_FALLBACK_URL =
  "https://fd.xuwubk.eu.org/https/ai.google.dev/gemini-api/docs/changelog";

export async function fetchGeminiDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const sources = [
    { url: GEMINI_DEVELOPER_CHANGELOG_URL, label: "Google" },
    { url: GEMINI_DEVELOPER_FALLBACK_URL, label: "fallback mirror" }
  ];
  const failures = [];

  for (const source of sources) {
    try {
      const response = await fetchImpl(source.url, {
        headers: {
          Accept: "text/html,text/markdown,text/plain;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const items = parseGeminiDeveloperChangelog(await response.text());
      if (source.label !== "Google") {
        console.warn(
          "Gemini developer changelog: Google returned no usable release notes; " +
          "using read-only mirror data. Source links still target Google."
        );
      }
      return items;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${source.label}: ${reason}`);
    }
  }

  throw new Error(
    "Gemini API developer feed unavailable after checking Google and the fallback mirror. " +
    failures.join(" | ").slice(0, 500)
  );
}

export function parseGeminiDeveloperChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Gemini developer changelog HTML was empty.");
  }

  // Some read-only renderers expose the official changelog as Markdown.
  // A real HTML page is still handled by the existing Cheerio parser below.
  if (!/^\s*<(?:!doctype|html|head|body|main|article|div|section)\b/i.test(html) &&
      /^#{2,4}\s+\S+/m.test(html)) {
    const markdownEntries = parseGeminiDeveloperMarkdown(html);
    if (markdownEntries.length) return markdownEntries;
  }

  const $ = cheerio.load(html);
  const articleRoot = findArticleRoot($);
  const allNodes = articleRoot.find("*").toArray();
  const dateHeadings = findDateHeadings($, articleRoot);

  if (!dateHeadings.length) {
    const title = cleanText($("title").first().text()) || "(no page title)";
    const headingCount = articleRoot.find("h2, h3, h4").length;
    throw new Error(
      "No Gemini API release-date headings were found. " +
      `Received page title: ${title}; headings found: ${headingCount}. ` +
      "Google may have changed the markup or returned an unexpected page."
    );
  }

  const entries = [];

  dateHeadings.forEach(function (headingNode, headingIndex) {
    const date = getNodeDate($, $(headingNode));
    if (!date) return;

    const startIndex = allNodes.indexOf(headingNode);
    const nextHeading = dateHeadings[headingIndex + 1];
    const endIndex = nextHeading ? allNodes.indexOf(nextHeading) : allNodes.length;

    if (startIndex < 0 || endIndex <= startIndex) return;

    const sectionNodes = allNodes.slice(startIndex + 1, endIndex);
    const topLevelItems = sectionNodes.filter(function (node) {
      const element = $(node);
      return element.is("li") && !element.parents("li").length;
    });

    if (topLevelItems.length) {
      topLevelItems.forEach(function (itemNode) {
        const item = $(itemNode);
        const summary = formatListItem($, item);
        if (!summary) return;

        const category = findNearestCategory($, sectionNodes, itemNode);
        const title = createGeminiTitle(category, summary);
        entries.push(createEntry(date, title, summary, category, $(headingNode)));
      });
      return;
    }

    const paragraphSummary = sectionNodes
      .filter(function (node) {
        return $(node).is("p") && !$(node).parents("li").length;
      })
      .map(function (node) {
        return cleanText($(node).text());
      })
      .filter(Boolean)
      .join("\n\n");

    if (paragraphSummary) {
      const title = firstWords(paragraphSummary, 9);
      entries.push(createEntry(date, title, paragraphSummary, "", $(headingNode)));
    }
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Gemini API date headings were found, but no release entries could be extracted."
    );
  }

  return deduplicated;
}

// Parse the same dated bullet format when a fallback returns Markdown
// rather than pre-rendered HTML. This keeps the API schema unchanged.
export function parseGeminiDeveloperMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const dateHeading = /^#{2,4}\s+(.+?)(?:\s+\{%\s*id=["']([^"']+)["']\s*%\})?\s*$/;
  const bullet = /^(\s*)(?:[-*+]\s+|\d+\.\s+)(.+)$/;
  const releases = [];
  let date = "";
  let anchor = "";
  let category = "";
  let current = null;

  const finishBullet = () => {
    if (!current || !date) { current = null; return; }
    const summary = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (summary) {
      const clean = cleanMarkdown(summary);
      const title = createGeminiTitle(category, `• ${clean}`);
      const entry = createEntry(date, title, `• ${clean}`, category, null);
      entry.sourceUrl = anchor
        ? `${GEMINI_DEVELOPER_CHANGELOG_URL}#${encodeURIComponent(anchor)}`
        : GEMINI_DEVELOPER_CHANGELOG_URL;
      releases.push(entry);
    }
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(dateHeading);
    if (heading) {
      const parsed = normaliseDate(heading[1].replace(/\s+\{%.*$/, ""));
      if (parsed) {
        finishBullet();
        date = parsed;
        anchor = heading[2] || (heading[1].match(/\{%\s*id=["']([^"']+)["']/i) || [])[1] || "";
        category = "";
        continue;
      }
      // An unrelated heading ends the previous release section.
      if (date) { finishBullet(); date = ""; }
    }
    if (!date) continue;

    const categoryMatch = line.trim().match(/^\*\*(API|Model|SDK|AI Studio|Library|Tool|Live API) updates?:?\*\*:?$/i);
    if (categoryMatch) {
      finishBullet();
      category = categoryMatch[1];
      continue;
    }

    const item = line.match(bullet);
    if (item && item[1].length <= 2) {
      finishBullet();
      current = { parts: [item[2]] };
      continue;
    }

    if (current && line.trim()) {
      if (item) current.parts.push(`; ${item[2]}`);
      else current.parts.push(line.trim());
    }
  }
  finishBullet();
  return deduplicateEntries(releases).sort((a, b) => b.date.localeCompare(a.date));
}

function cleanMarkdown(value) {
  return String(value)
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findArticleRoot($) {
  const selectors = [
    "article.devsite-article-body",
    ".devsite-article-body",
    "main article",
    "article",
    "main"
  ];

  for (const selector of selectors) {
    for (const node of $(selector).toArray()) {
      const root = $(node);
      if (findDateHeadings($, root).length) return root;
    }
  }

  return $("main").first().length ? $("main").first() : $.root();
}

function findDateHeadings($, root) {
  // Prefer complete heading elements. Fall back to Google's internal
  // .devsite-heading spans or <time> elements if the wrapping heading changed.
  const candidates = root
    .find("h2, h3, h4, .devsite-heading, time[datetime]")
    .toArray();
  const selected = [];
  const selectedSet = new Set();

  candidates.forEach(function (node) {
    const element = $(node);
    if (!getNodeDate($, element)) return;

    // Do not mistake an incidental date inside a release bullet for a section.
    if (element.parents("li, p, blockquote").length) return;

    // Avoid splitting the same date into both the heading and its inner span.
    let ancestor = node.parent;
    while (ancestor) {
      if (selectedSet.has(ancestor)) return;
      ancestor = ancestor.parent;
    }

    selected.push(node);
    selectedSet.add(node);
  });

  return selected;
}

function getNodeDate($, element) {
  const values = [
    element.attr("datetime"),
    element.attr("data-text"),
    element.find("time[datetime]").first().attr("datetime"),
    element.find(".devsite-heading").first().text(),
    element.text()
  ];

  for (const value of values) {
    const date = normaliseDate(value);
    if (date) return date;
  }
  return "";
}

function formatListItem($, item, depth = 0) {
  const copy = item.clone();
  copy.children("ul, ol").remove();

  const lines = [];
  const mainText = cleanText(copy.text());

  if (mainText) {
    lines.push(`${"  ".repeat(depth)}• ${mainText}`);
  }

  item.children("ul, ol").each(function () {
    $(this).children("li").each(function () {
      const nested = formatListItem($, $(this), depth + 1);
      if (nested) lines.push(nested);
    });
  });

  return lines.join("\n").trim();
}

function findNearestCategory($, sectionNodes, itemNode) {
  const itemIndex = sectionNodes.indexOf(itemNode);

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const element = $(sectionNodes[index]);
    if (element.is("li")) continue;

    const text = cleanText(element.text());
    if (/^(API|Model|SDK|AI Studio|Library|Tool|Live API) updates?:?$/i.test(text)) {
      return text.replace(/\s*updates?:?$/i, "");
    }
    if (element.is("h3, h4")) break;
  }

  return "";
}

function createGeminiTitle(category, summary) {
  const mainText = summary
    .replace(/^[\s•–—-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = firstWords(mainText, 9);
  return category ? `${category}: ${title}` : title;
}

function createEntry(date, title, summary, category, headingNode) {
  return {
    id: `gemini-developer-${date}-${slugify(title)}`,
    providerId: "gemini",
    providerName: "Google",
    product: "Gemini API",
    audience: "developer",
    title,
    date,
    datePrecision: "day",
    summary,
    tags: classifyGeminiDeveloperTags(title, summary, category),
    sourceUrl: buildSourceUrl(headingNode)
  };
}

function classifyGeminiDeveloperTags(title, summary, category) {
  const text = `${category} ${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "sunset", "shut down", "no longer supported", "retired"])) {
    tags.push("Deprecated");
  }
  if (containsAny(text, ["pricing", "price", "billing", "cost", "paid tier"])) {
    tags.push("Pricing");
  }
  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue", "reliability"])) {
    tags.push("Fixed");
  }
  if (containsAny(text, ["model", "gemini", "gemma", "imagen", "veo", "lyria", "embedding"])) {
    tags.push("Model update");
  }
  if (containsAny(text, ["api", "sdk", "library", "generatecontent", "live api", "function call", "tool", "endpoint"])) {
    tags.push("API");
  }
  if (containsAny(text, ["released", "launched", "introduced", "added", "support for", "now available"])) {
    tags.push("New feature");
  }
  if (containsAny(text, ["updated", "improved", "enhanced", "expanded", "increased", "faster"])) {
    tags.push("Improvement");
  }
  if (containsAny(text, ["safety", "responsible ai", "content filter", "harm", "security"])) {
    tags.push("Safety");
  }
  return tags.length ? Array.from(new Set(tags)) : ["API"];
}

function normaliseDate(value) {
  const text = cleanText(value)
    .replace(/[¶#\u200b]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const iso = text.match(ISO_DATE_PATTERN);
  if (iso) {
    return validateDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const english = text.match(ENGLISH_DATE_PATTERN);
  if (!english) return "";

  const month = MONTHS[english[1].toLowerCase()];
  if (!month) return "";
  return validateDate(Number(english[3]), Number(month), Number(english[2]));
}

function validateDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildSourceUrl(headingNode) {
  if (!headingNode) return GEMINI_DEVELOPER_CHANGELOG_URL;
  const container = headingNode.is("h2, h3, h4")
    ? headingNode
    : headingNode.closest("h2, h3, h4");
  const id = container.attr("id") || headingNode.attr("id");
  return id
    ? `${GEMINI_DEVELOPER_CHANGELOG_URL}#${encodeURIComponent(id)}`
    : GEMINI_DEVELOPER_CHANGELOG_URL;
}

function deduplicateEntries(entries) {
  const byKey = new Map();
  entries.forEach(function (entry) {
    const key = `${entry.date}|${entry.title.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, entry);
      return;
    }
    const existing = byKey.get(key);
    if (entry.summary.length > existing.summary.length) existing.summary = entry.summary;
    existing.tags = Array.from(new Set(existing.tags.concat(entry.tags)));
  });
  return Array.from(byKey.values());
}

function containsAny(text, terms) {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function firstWords(value, count) {
  return String(value || "").trim().split(/\s+/).slice(0, count).join(" ");
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
