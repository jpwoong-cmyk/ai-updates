export const XAI_DEVELOPER_CHANGELOG_URL =
  "https://docs.x.ai/developers/release-notes";

const MONTH_HEADING_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?$/i;

const DATE_PATTERN =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i;

const MONTHS = {
  jan:"01", january:"01", feb:"02", february:"02", mar:"03", march:"03",
  apr:"04", april:"04", may:"05", jun:"06", june:"06", jul:"07", july:"07",
  aug:"08", august:"08", sep:"09", sept:"09", september:"09", oct:"10",
  october:"10", nov:"11", november:"11", dec:"12", december:"12"
};

export async function fetchXaiDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const response = await fetchImpl(XAI_DEVELOPER_CHANGELOG_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.7 (+https://vercel.com)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `xAI developer release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseXaiDeveloperChangelog(await response.text());
}

export function parseXaiDeveloperChangelog(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("xAI developer release-notes HTML was empty.");
  }

  const lines = htmlToSemanticLines(html);
  const releaseHeadingIndex = lines.findIndex(line =>
    /^Release Notes$/i.test(line.text)
  );

  if (releaseHeadingIndex < 0) {
    throw new Error(
      "The official xAI page loaded, but the Release Notes heading was not found."
    );
  }

  const scopedLines = lines.slice(releaseHeadingIndex + 1);
  const entries = [];

  let currentYear = new Date().getUTCFullYear();
  let currentDate = "";
  let currentTitle = "";
  let currentSummary = [];

  function flush() {
    if (currentDate && currentTitle) {
      const summary = cleanSummary(currentSummary.join("\n"));

      if (summary) {
        entries.push({
          id: `xai-developer-${currentDate}-${slugify(currentTitle)}`,
          providerId: "xai",
          providerName: "xAI",
          product: "Grok / xAI API",
          audience: "developer",
          title: currentTitle,
          date: currentDate,
          datePrecision: "day",
          summary,
          tags: classifyDeveloperTags(currentTitle, summary),
          sourceUrl: XAI_DEVELOPER_CHANGELOG_URL
        });
      }
    }

    currentTitle = "";
    currentSummary = [];
  }

  for (const line of scopedLines) {
    const text = line.text;

    if (line.type === "h2" || line.type === "text") {
      const monthMatch = text.match(MONTH_HEADING_PATTERN);

      if (monthMatch && !DATE_PATTERN.test(text)) {
        flush();
        if (monthMatch[2]) currentYear = Number(monthMatch[2]);
        currentDate = "";
        continue;
      }
    }

    const dateMatch = text.match(DATE_PATTERN);

    if (dateMatch && line.type !== "h3" && line.type !== "h4") {
      flush();

      const explicitYear = dateMatch[3]
        ? Number(dateMatch[3])
        : currentYear;

      currentDate = normaliseDate(
        dateMatch[1],
        dateMatch[2],
        explicitYear
      );

      continue;
    }

    if (line.type === "h3" || line.type === "h4") {
      flush();

      if (currentDate && !/^Release Notes$/i.test(text)) {
        currentTitle = text;
      }

      continue;
    }

    if (currentDate && currentTitle && !isDeveloperPageNoise(text)) {
      currentSummary.push(
        line.type === "li" ? `• ${text}` : text
      );
    }
  }

  flush();

  const deduplicated = deduplicateEntries(entries)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!deduplicated.length) {
    throw new Error(
      "The official xAI Release Notes page loaded, but no dated developer entries were extracted."
    );
  }

  return deduplicated;
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
      (_, content) => `\n@@LI@@ ${stripTags(content)}\n`)
    .replace(/<(?:p|time|div|section|article|main|span|a|button)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|time|div|section|article|main|span|a|button)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = decodeEntities(text)
    .split(/\n+/)
    .map(function (rawLine) {
      const line = cleanText(rawLine);
      const heading = line.match(/^@@H([1-6])@@\s*(.*)$/);

      if (heading) {
        return {
          type: `h${heading[1]}`,
          text: cleanText(heading[2])
        };
      }

      const listItem = line.match(/^@@LI@@\s*(.*)$/);

      if (listItem) {
        return {
          type: "li",
          text: cleanText(listItem[1])
        };
      }

      return { type: "text", text: line };
    })
    .filter(line => Boolean(line.text));

  return removeConsecutiveDuplicateLines(lines);
}

function stripTags(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normaliseDate(monthName, day, year) {
  const month = MONTHS[String(monthName).toLowerCase()];
  if (!month) return "";

  const numericYear = Number(year);
  const numericDay = Number(day);
  const currentYear = new Date().getUTCFullYear();

  if (
    !Number.isInteger(numericYear) ||
    numericYear < 2024 ||
    numericYear > currentYear + 1 ||
    !Number.isInteger(numericDay) ||
    numericDay < 1 ||
    numericDay > 31
  ) {
    return "";
  }

  return `${numericYear}-${month}-${String(numericDay).padStart(2, "0")}`;
}

function isDeveloperPageNoise(text) {
  return (
    /^Copy for LLM/i.test(text) ||
    /^View as Markdown$/i.test(text) ||
    /^Create API key$/i.test(text) ||
    /^Meet grok-/i.test(text) ||
    /^Last updated:/i.test(text)
  );
}

function classifyDeveloperTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated","deprecation","sunset","retired","removed","discontinued"])) {
    tags.push("Deprecated");
  }
  if (containsAny(text, ["pricing","price","billing","cost","billed","token"])) {
    tags.push("Pricing");
  }
  if (containsAny(text, ["fixed","fix","bug","resolved"])) {
    tags.push("Fixed");
  }
  if (containsAny(text, ["model","grok-","grok ","context window","reasoning effort"])) {
    tags.push("Model update");
  }
  if (containsAny(text, ["api","sdk","endpoint","responses","batch","websocket","files","mcp","speech to text","text-to-speech","speech to speech"])) {
    tags.push("API");
  }
  if (containsAny(text, ["released","launch","launched","introduced","added","now available","supports"])) {
    tags.push("New feature");
  }
  if (containsAny(text, ["updated","improved","enhanced","expanded","faster","integration"])) {
    tags.push("Improvement");
  }
  if (containsAny(text, ["safety","security","privacy"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["API"];
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

function removeConsecutiveDuplicateLines(lines) {
  return lines.filter(function (line, index) {
    if (index === 0) return true;
    const previous = lines[index - 1];
    return !(previous.type === line.type && previous.text === line.text);
  });
}

function cleanSummary(value) {
  return String(value || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
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
