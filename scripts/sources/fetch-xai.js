export const XAI_PRODUCT_CHANGELOG_URL =
  "https://grok.com/release-notes";

export const XAI_PRODUCT_RETRIEVAL_URL =
  "https://releases.sh/xai/grok";

const RETRIEVAL_CANDIDATES = [
  { url: "https://releases.sh/xai/grok.json", type: "json" },
  { url: "https://releases.sh/xai/grok.md", type: "markdown" },
  { url: XAI_PRODUCT_RETRIEVAL_URL, type: "html" }
];

const MONTHS = {
  jan:"01", january:"01", feb:"02", february:"02", mar:"03", march:"03",
  apr:"04", april:"04", may:"05", jun:"06", june:"06", jul:"07", july:"07",
  aug:"08", august:"08", sep:"09", sept:"09", september:"09", oct:"10",
  october:"10", nov:"11", november:"11", dec:"12", december:"12"
};

const LONG_DATE_PATTERN =
  /^(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;

export async function fetchXaiProductChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const failures = [];

  for (const candidate of RETRIEVAL_CANDIDATES) {
    try {
      const response = await fetchImpl(candidate.url, {
        headers: {
          Accept: acceptForType(candidate.type),
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mini-AI-Encyclopedia/1.7 (+https://vercel.com)"
        },
        redirect: "follow"
      });

      if (!response.ok) {
        failures.push(`${candidate.url}: HTTP ${response.status}`);
        continue;
      }

      const raw = await response.text();
      const items =
        candidate.type === "json"
          ? parseXaiProductJson(raw)
          : candidate.type === "markdown"
            ? parseXaiProductMarkdown(raw)
            : parseXaiProductHtml(raw);

      if (items.length) return items;

      failures.push(`${candidate.url}: no Grok Release Notes entries found`);
    } catch (error) {
      failures.push(`${candidate.url}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  throw new Error(
    "Grok product release notes could not be loaded. " +
    `Attempts: ${failures.join(" | ")}`
  );
}

export function parseXaiProductJson(raw) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return []; }

  const arrays = collectArrays(payload);

  for (const array of arrays) {
    const items = array.map(normaliseJsonRelease).filter(Boolean);
    if (items.length) return deduplicateEntries(items).sort(sortEntries);
  }

  return [];
}

export function parseXaiProductMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) return [];

  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(function (rawLine) {
      const heading = rawLine.match(/^(#{1,6})\s+(.+)$/);

      if (heading) {
        return {
          type: `h${heading[1].length}`,
          text: cleanText(heading[2])
        };
      }

      return {
        type: "text",
        text: cleanText(
          rawLine
            .replace(/^[-*+]\s+/, "• ")
            .replace(/^\d+[.)]\s+/, "• ")
        )
      };
    })
    .filter(line => Boolean(line.text));

  return parseProductSemanticLines(lines);
}

export function parseXaiProductHtml(html) {
  if (typeof html !== "string" || !html.trim()) return [];
  return parseProductSemanticLines(htmlToSemanticLines(html));
}

function parseProductSemanticLines(lines) {
  const entries = [];
  let currentDate = "";
  let currentTitle = "";
  let currentSummary = [];
  let currentIsReleaseNotes = false;

  function flush() {
    if (currentDate && currentTitle && currentIsReleaseNotes) {
      const summary = cleanSummary(currentSummary.join("\n"));

      if (summary && !isAppStoreTitle(currentTitle)) {
        entries.push(createProductEntry({
          date: currentDate,
          title: currentTitle,
          summary
        }));
      }
    }

    currentTitle = "";
    currentSummary = [];
    currentIsReleaseNotes = false;
  }

  for (const line of lines) {
    const text = line.text;
    const date = normaliseDate(text);

    if (date) {
      flush();
      currentDate = date;
      continue;
    }

    if (line.type === "h2" || line.type === "h3" || line.type === "h4") {
      if (
        /^grok$/i.test(text) ||
        /^release notes?$/i.test(text) ||
        /^releases?$/i.test(text)
      ) {
        continue;
      }

      flush();
      currentTitle = text;
      continue;
    }

    if (!currentDate || !currentTitle) continue;

    if (/^release notes?$/i.test(text)) {
      currentIsReleaseNotes = true;
      continue;
    }

    if (
      /^read more/i.test(text) ||
      /^available for ios$/i.test(text) ||
      /^\.(json|md|atom)$/i.test(text)
    ) {
      continue;
    }

    currentSummary.push(text);
  }

  flush();
  return deduplicateEntries(entries).sort(sortEntries);
}

function normaliseJsonRelease(value) {
  if (!value || typeof value !== "object") return null;

  const title = cleanText(value.title || value.name || value.headline || "");
  const date = normaliseDate(
    value.date ||
    value.publishedAt ||
    value.published_at ||
    value.releaseDate ||
    value.release_date ||
    ""
  );
  const summary = cleanSummary(
    extractText(
      value.summary ||
      value.description ||
      value.body ||
      value.content ||
      ""
    )
  );
  const label = cleanText(
    value.type ||
    value.sourceType ||
    value.source_type ||
    value.category ||
    value.kind ||
    ""
  );
  const source = cleanText(
    value.sourceUrl ||
    value.source_url ||
    value.url ||
    value.href ||
    ""
  );

  const looksLikeReleaseNote =
    /release notes?/i.test(label) ||
    source.includes("grok.com/release-notes") ||
    /release notes?/i.test(summary);

  if (!date || !title || !summary || !looksLikeReleaseNote || isAppStoreTitle(title)) {
    return null;
  }

  return createProductEntry({
    date,
    title,
    summary: summary.replace(/^Release Notes[.:]?\s*/i, "")
  });
}

function htmlToSemanticLines(html) {
  let text = String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "\n")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "\n")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "\n")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, level, content) => `\n@@H${level}@@ ${stripTags(content)}\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi,
      (_, content) => `\n• ${stripTags(content)}\n`)
    .replace(/<(?:p|time|div|section|article|main|span|a)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|time|div|section|article|main|span|a)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return removeConsecutiveDuplicateLines(
    decodeEntities(text)
      .split(/\n+/)
      .map(function (rawLine) {
        const line = cleanText(rawLine);
        const marker = line.match(/^@@H([1-6])@@\s*(.*)$/);

        if (marker) {
          return {
            type: `h${marker[1]}`,
            text: cleanText(marker[2])
          };
        }

        return { type: "text", text: line };
      })
      .filter(line => Boolean(line.text))
  );
}

function stripTags(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function collectArrays(value, results = []) {
  if (!value || typeof value !== "object") return results;

  if (Array.isArray(value)) {
    results.push(value);
    value.forEach(item => collectArrays(item, results));
    return results;
  }

  Object.values(value).forEach(child => collectArrays(child, results));
  return results;
}

function extractText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(extractText).filter(Boolean).join(" ");
  }
  return "";
}

function createProductEntry({ date, title, summary }) {
  return {
    id: `xai-product-${date}-${slugify(title)}`,
    providerId: "xai",
    providerName: "xAI",
    product: "Grok",
    audience: "product",
    title,
    date,
    datePrecision: "day",
    summary,
    tags: classifyProductTags(title, summary),
    sourceUrl: XAI_PRODUCT_CHANGELOG_URL
  };
}

function normaliseDate(value) {
  const text = cleanText(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) return validateDateParts(isoMatch[1], isoMatch[2], isoMatch[3]);

  const match = text.match(LONG_DATE_PATTERN);
  if (!match) return "";

  return validateDateParts(match[3], MONTHS[match[1].toLowerCase()], match[2]);
}

function validateDateParts(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const currentYear = new Date().getUTCFullYear();

  if (
    !Number.isInteger(numericYear) ||
    !Number.isInteger(numericMonth) ||
    !Number.isInteger(numericDay) ||
    numericYear < 2023 ||
    numericYear > currentYear + 1 ||
    numericMonth < 1 ||
    numericMonth > 12 ||
    numericDay < 1 ||
    numericDay > 31
  ) {
    return "";
  }

  return `${numericYear}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`;
}

function isAppStoreTitle(title) {
  return /Grok\s*-\s*AI Chat/i.test(title) || /\bv\d+\.\d+(?:\.\d+)?\b/i.test(title);
}

function classifyProductTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["new","launch","introduced","available","rollout","rolling out","added"])) {
    tags.push("New feature");
  }
  if (containsAny(text, ["grok 4","model","reasoning","context window"])) {
    tags.push("Model update");
  }
  if (containsAny(text, ["improved","improvement","faster","better","enhanced","polish"])) {
    tags.push("Improvement");
  }
  if (containsAny(text, ["bug fix","bug fixes","fixed","fixes"])) {
    tags.push("Fixed");
  }
  if (containsAny(text, ["deprecated","retired","removed","sunset"])) {
    tags.push("Deprecated");
  }
  if (containsAny(text, ["pricing","price","subscription","plan"])) {
    tags.push("Pricing");
  }
  if (containsAny(text, ["safety","security","privacy"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["Improvement"];
}

function acceptForType(type) {
  if (type === "json") return "application/json,text/plain;q=0.9,*/*;q=0.8";
  if (type === "markdown") return "text/markdown,text/plain;q=0.9,*/*;q=0.8";
  return "text/html,application/xhtml+xml";
}

function deduplicateEntries(entries) {
  const map = new Map();

  entries.forEach(function (entry) {
    const key = `${entry.date}|${entry.title.toLowerCase()}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, entry);
      return;
    }

    if (entry.summary.length > existing.summary.length) {
      existing.summary = entry.summary;
    }

    existing.tags = Array.from(new Set(existing.tags.concat(entry.tags)));
  });

  return Array.from(map.values());
}

function sortEntries(first, second) {
  if (second.date !== first.date) return second.date.localeCompare(first.date);
  return first.title.localeCompare(second.title);
}

function removeConsecutiveDuplicateLines(lines) {
  return lines.filter(function (line, index) {
    if (index === 0) return true;
    const previous = lines[index - 1];
    return !(previous.type === line.type && previous.text === line.text);
  });
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function cleanSummary(value) {
  return cleanText(value)
    .replace(/^Release Notes[.:]?\s*/i, "")
    .replace(/\s+Read more\s*→?$/i, "")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function slugify(value) {
  return String(value || "update")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "update";
}
