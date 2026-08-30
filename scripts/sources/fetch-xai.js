export const XAI_PRODUCT_CHANGELOG_URL =
  "https://grok.com/release-notes";

const EARLIEST_GROK_YEAR = 2023;
const MAX_FUTURE_YEAR_OFFSET = 1;

const MONTHS = {
  january: "01", jan: "01",
  february: "02", feb: "02",
  march: "03", mar: "03",
  april: "04", apr: "04",
  may: "05",
  june: "06", jun: "06",
  july: "07", jul: "07",
  august: "08", aug: "08",
  september: "09", sep: "09", sept: "09",
  october: "10", oct: "10",
  november: "11", nov: "11",
  december: "12", dec: "12"
};

const LONG_DATE_RE =
  /^(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;

const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](?:\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const DATE_KEYS =
  /^(date|publishedAt|published_at|releaseDate|release_date|createdAt|created_at|updatedAt|updated_at)$/i;

const TITLE_KEYS =
  /^(title|name|headline|heading)$/i;

const SUMMARY_KEYS =
  /^(summary|description|body|content|details|text)$/i;

export async function fetchXaiProductChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(XAI_PRODUCT_CHANGELOG_URL, {
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: "https://grok.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/152.0.0.0 Safari/537.36"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Grok product release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseXaiProductChangelog(await response.text());
}

export function parseXaiProductChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Grok product release-notes HTML was empty.");
  }

  const entries = deduplicateEntries([
    ...parseVisibleSemanticHtml(html),
    ...parseEmbeddedJson(html),
    ...parseStructuredNextPayloads(html)
  ])
    .filter(isPlausibleRelease)
    .sort(sortEntries);

  if (!entries.length) {
    throw new Error(
      "Grok release notes loaded, but no trustworthy product release entries " +
      "could be extracted. The parser intentionally rejects ambiguous client " +
      "configuration data rather than displaying fake release dates."
    );
  }

  return entries;
}

function parseVisibleSemanticHtml(html) {
  const withoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const tokenPattern =
    /<(h1|h2|h3|h4|p|li|time)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  const entries = [];
  let currentDate = "";
  let currentTitle = "";
  let summaryLines = [];

  function flush() {
    if (currentDate && currentTitle && summaryLines.length) {
      const summary = cleanSummary(summaryLines.join("\n"));

      if (summary) {
        entries.push(createEntry({
          date: currentDate,
          title: currentTitle,
          summary
        }));
      }
    }

    currentTitle = "";
    summaryLines = [];
  }

  let match;

  while ((match = tokenPattern.exec(withoutScripts))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    const content = match[3] || "";

    const datetime =
      readAttribute(attrs, "datetime") ||
      readAttribute(attrs, "data-date");

    const text = cleanText(datetime || content);

    if (!text) continue;

    const date = normaliseReleaseDate(text);

    if (date) {
      flush();
      currentDate = date;
      continue;
    }

    if (/^h[1-4]$/.test(tag)) {
      if (
        /^release notes?$/i.test(text) ||
        /^grok$/i.test(text)
      ) {
        continue;
      }

      if (currentTitle && summaryLines.length) {
        flush();
      }

      if (isPlausibleTitle(text)) {
        currentTitle = text;
      }

      continue;
    }

    if (currentDate && currentTitle) {
      summaryLines.push(
        tag === "li" ? `• ${text}` : text
      );
    }
  }

  flush();
  return entries;
}

function parseEmbeddedJson(html) {
  const entries = [];
  const scriptPattern =
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = scriptPattern.exec(html))) {
    const attrs = match[1] || "";
    const raw = (match[2] || "").trim();

    if (!raw) continue;

    const type =
      readAttribute(attrs, "type").toLowerCase();

    const id =
      readAttribute(attrs, "id").toLowerCase();

    const looksJson =
      type.includes("json") ||
      id.includes("next_data") ||
      /^[\[{]/.test(raw);

    if (!looksJson) continue;

    const parsed = tryParseJson(raw);

    if (parsed !== null) {
      walkStructuredJson(
        parsed,
        entries,
        new Set()
      );
    }
  }

  return entries;
}

function parseStructuredNextPayloads(html) {
  const entries = [];

  const pattern =
    /<script\b[^>]*>([\s\S]*?self\.__next_f\.push[\s\S]*?)<\/script>/gi;

  let match;

  while ((match = pattern.exec(html))) {
    const text =
      decodeCommonEscapes(match[1]);

    const candidates =
      extractJsonObjects(text);

    for (const candidate of candidates) {
      const parsed =
        tryParseJson(candidate);

      if (parsed !== null) {
        walkStructuredJson(
          parsed,
          entries,
          new Set()
        );
      }
    }
  }

  return entries;
}

function walkStructuredJson(
  value,
  entries,
  visited
) {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object"
  ) {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) =>
      walkStructuredJson(
        item,
        entries,
        visited
      )
    );

    return;
  }

  const objectEntry =
    releaseEntryFromObject(value);

  if (objectEntry) {
    entries.push(objectEntry);
  }

  Object.values(value).forEach((child) =>
    walkStructuredJson(
      child,
      entries,
      visited
    )
  );
}

function releaseEntryFromObject(object) {
  let dateValue = "";
  let titleValue = "";
  let summaryValue = "";

  for (const [key, value] of Object.entries(object)) {
    if (
      DATE_KEYS.test(key) &&
      typeof value === "string"
    ) {
      dateValue = value;
      continue;
    }

    if (
      TITLE_KEYS.test(key) &&
      typeof value === "string"
    ) {
      titleValue = value;
      continue;
    }

    if (SUMMARY_KEYS.test(key)) {
      summaryValue =
        extractTextValue(value);
    }
  }

  const date =
    normaliseReleaseDate(dateValue);

  const title =
    cleanText(titleValue);

  const summary =
    cleanSummary(summaryValue);

  if (
    !date ||
    !isPlausibleTitle(title) ||
    !summary
  ) {
    return null;
  }

  return createEntry({
    date,
    title,
    summary
  });
}

function createEntry({
  date,
  title,
  summary
}) {
  return {
    id:
      `xai-product-${date}-${slugify(title)}`,
    providerId: "xai",
    providerName: "xAI",
    product: "Grok",
    audience: "product",
    title: cleanText(title),
    date,
    datePrecision: "day",
    summary: cleanSummary(summary),
    tags:
      classifyProductTags(
        title,
        summary
      ),
    sourceUrl:
      XAI_PRODUCT_CHANGELOG_URL
  };
}

function normaliseReleaseDate(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  const iso =
    text.match(ISO_DATE_RE);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    if (
      !isAllowedYear(year) ||
      !isValidMonthDay(month, day)
    ) {
      return "";
    }

    return (
      `${year}-` +
      `${String(month).padStart(2, "0")}-` +
      `${String(day).padStart(2, "0")}`
    );
  }

  const longDate =
    text.match(LONG_DATE_RE);

  if (!longDate) {
    // Deliberately DO NOT call Date.parse() here.
    // Grok's client payload contains many arbitrary strings/numbers
    // which JavaScript can incorrectly interpret as dates.
    return "";
  }

  const year =
    Number(longDate[3]);

  const month =
    Number(
      MONTHS[
        longDate[1].toLowerCase()
      ]
    );

  const day =
    Number(longDate[2]);

  if (
    !isAllowedYear(year) ||
    !isValidMonthDay(month, day)
  ) {
    return "";
  }

  return (
    `${year}-` +
    `${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}`
  );
}

function isAllowedYear(year) {
  const maxYear =
    new Date().getUTCFullYear() +
    MAX_FUTURE_YEAR_OFFSET;

  return (
    Number.isInteger(year) &&
    year >= EARLIEST_GROK_YEAR &&
    year <= maxYear
  );
}

function isValidMonthDay(
  month,
  day
) {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

function isPlausibleTitle(value) {
  const title =
    cleanText(value);

  if (
    title.length < 4 ||
    title.length > 180
  ) {
    return false;
  }

  // Reject internal/client identifiers seen in Grok's payload:
  // backend_detection, extra_suggestions, etc.
  if (
    /^[a-z0-9]+(?:_[a-z0-9]+)+:?$/i.test(title)
  ) {
    return false;
  }

  // Reject tiny config keys such as "a8:".
  if (
    /^[a-z]\d{1,3}:?$/i.test(title)
  ) {
    return false;
  }

  const letters =
    title.match(/[a-z]/gi) || [];

  return letters.length >= 4;
}

function classifyProductTags(
  title,
  summary
) {
  const text =
    `${title} ${summary}`
      .toLowerCase();

  const tags =
    new Set();

  if (
    /new|introduc|launch|available|rolling out|release/.test(text)
  ) {
    tags.add("New feature");
  }

  if (
    /grok\s*\d|model|reasoning|thinking|context window/.test(text)
  ) {
    tags.add("Model update");
  }

  if (
    /improv|faster|better|enhanc|upgrade|performance/.test(text)
  ) {
    tags.add("Improvement");
  }

  if (/fix|fixed|bug/.test(text)) {
    tags.add("Fixed");
  }

  if (
    /deprecat|retir|removed|sunset/.test(text)
  ) {
    tags.add("Deprecated");
  }

  if (
    /price|pricing|plan|subscription/.test(text)
  ) {
    tags.add("Pricing");
  }

  if (
    /safe|safety|security|privacy/.test(text)
  ) {
    tags.add("Safety");
  }

  if (!tags.size) {
    tags.add("Improvement");
  }

  return Array.from(tags);
}

function isPlausibleRelease(entry) {
  return Boolean(
    entry &&
    entry.providerId === "xai" &&
    entry.audience === "product" &&
    entry.date &&
    isPlausibleTitle(entry.title) &&
    entry.summary &&
    entry.summary.length >= 8
  );
}

function deduplicateEntries(entries) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry) continue;

    const key = [
      entry.date,
      entry.title
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    ].join("|");

    if (!map.has(key)) {
      map.set(key, entry);
      continue;
    }

    const existing =
      map.get(key);

    if (
      entry.summary.length >
      existing.summary.length
    ) {
      existing.summary =
        entry.summary;
    }

    existing.tags =
      Array.from(
        new Set(
          existing.tags.concat(
            entry.tags
          )
        )
      );
  }

  return Array.from(
    map.values()
  );
}

function sortEntries(a, b) {
  if (b.date !== a.date) {
    return b.date.localeCompare(a.date);
  }

  return a.title.localeCompare(b.title);
}

function readAttribute(
  attrs,
  name
) {
  const escaped =
    name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const re =
    new RegExp(
      `${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i"
    );

  const match =
    String(attrs || "")
      .match(re);

  return match
    ? (
      match[1] ??
      match[2] ??
      match[3] ??
      ""
    )
    : "";
}

function extractTextValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(extractTextValue)
      .filter(Boolean)
      .join("\n");
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.values(value)
      .map(extractTextValue)
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function cleanSummary(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}

function cleanText(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\\n/g, " ")
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

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonObjects(text) {
  const candidates = [];

  let depth = 0;
  let start = -1;
  let quote = "";
  let escaped = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const char =
      text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (
      char === '"' ||
      char === "'"
    ) {
      quote = char;
      continue;
    }

    if (
      char === "{" ||
      char === "["
    ) {
      if (depth === 0) {
        start = index;
      }

      depth += 1;
      continue;
    }

    if (
      char === "}" ||
      char === "]"
    ) {
      depth -= 1;

      if (
        depth === 0 &&
        start >= 0
      ) {
        candidates.push(
          text.slice(
            start,
            index + 1
          )
        );

        start = -1;
      }
    }
  }

  return candidates;
}

function decodeCommonEscapes(value) {
  return String(value || "")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u0022/g, '"')
    .replace(/\\u0027/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) ||
    "release";
}
