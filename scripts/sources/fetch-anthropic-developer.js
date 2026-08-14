export const ANTHROPIC_DEVELOPER_CHANGELOG_URL =
  "https://platform.claude.com/docs/en/release-notes/overview";

const ANTHROPIC_DEVELOPER_CHANGELOG_FEED_URL =
  "https://platform.claude.com/docs/en/release-notes/overview.md";

const DATE_PATTERN =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i;

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

export async function fetchAnthropicDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(ANTHROPIC_DEVELOPER_CHANGELOG_FEED_URL, {
    headers: {
      Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.2 (+https://vercel.com)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Claude Platform release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseAnthropicDeveloperChangelog(await response.text());
}

export function parseAnthropicDeveloperChangelog(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new Error("Claude Platform release-notes Markdown was empty.");
  }

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let currentSection = null;

  lines.forEach(function (line) {
    const headingMatch = line.trim().match(/^#{1,6}\s+(.+?)\s*#*$/);

    if (headingMatch) {
      const headingText = cleanMarkdownText(headingMatch[1]);
      const date = normaliseDate(headingText);

      if (date) {
        currentSection = {
          date,
          lines: []
        };
        sections.push(currentSection);
        return;
      }

      // Once another non-date heading begins, stop attaching content to the
      // previous release date. This prevents unrelated documentation sections
      // from being treated as changelog entries.
      if (currentSection) {
        currentSection = null;
      }
      return;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  });

  if (!sections.length) {
    throw new Error(
      "No Claude Platform release-date headings were found in the official Markdown feed."
    );
  }

  const entries = [];

  sections.forEach(function (section) {
    parseSectionEntries(section.lines).forEach(function (summary) {
      entries.push(createEntry(section.date, summary));
    });
  });

  const deduplicated = deduplicateEntries(entries).sort(function (first, second) {
    return second.date.localeCompare(first.date);
  });

  if (!deduplicated.length) {
    throw new Error(
      "Claude Platform date headings were found, but no release entries could be extracted from the official Markdown feed."
    );
  }

  return deduplicated;
}

function parseSectionEntries(lines) {
  const topLevelItems = [];
  let currentItem = null;

  lines.forEach(function (line) {
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);

    if (bulletMatch) {
      const indent = bulletMatch[1].replace(/\t/g, "    ").length;
      const text = cleanMarkdownText(bulletMatch[2]);

      if (!text) {
        return;
      }

      if (indent === 0) {
        if (currentItem) {
          topLevelItems.push(formatCollectedItem(currentItem));
        }

        currentItem = {
          main: text,
          nested: []
        };
        return;
      }

      if (currentItem) {
        const depth = Math.max(1, Math.ceil(indent / 2));
        currentItem.nested.push(`${"  ".repeat(depth)}• ${text}`);
      }
      return;
    }

    const text = cleanMarkdownText(line);

    if (currentItem && text) {
      // Markdown often wraps a single list item across multiple physical lines.
      // Keep those lines with the same release item.
      currentItem.main += ` ${text}`;
    }
  });

  if (currentItem) {
    topLevelItems.push(formatCollectedItem(currentItem));
  }

  const cleanedItems = topLevelItems.filter(Boolean);
  if (cleanedItems.length) {
    return cleanedItems;
  }

  // Fallback for any future release-date section that uses paragraphs instead
  // of a bullet list.
  return splitParagraphs(lines)
    .map(cleanMarkdownText)
    .filter(Boolean);
}

function formatCollectedItem(item) {
  const main = cleanText(item.main);
  if (!main) {
    return "";
  }

  return [`• ${main}`].concat(item.nested).join("\n").trim();
}

function splitParagraphs(lines) {
  const paragraphs = [];
  let buffer = [];

  function flush() {
    const paragraph = buffer.join(" ").trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
    buffer = [];
  }

  lines.forEach(function (line) {
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      return;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flush();
      return;
    }

    buffer.push(trimmed);
  });

  flush();
  return paragraphs;
}

function createEntry(date, summary) {
  const title = createTitle(summary);

  return {
    id: `anthropic-developer-${date}-${slugify(title)}`,
    providerId: "anthropic",
    providerName: "Anthropic",
    product: "Claude Platform",
    audience: "developer",
    title,
    date,
    datePrecision: "day",
    summary,
    tags: classifyAnthropicDeveloperTags(title, summary),
    sourceUrl: ANTHROPIC_DEVELOPER_CHANGELOG_URL
  };
}

function createTitle(summary) {
  return firstWords(
    String(summary || "")
      .replace(/^[\s•–—-]+/gm, " ")
      .replace(/\s+/g, " ")
      .trim(),
    10
  );
}

function classifyAnthropicDeveloperTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [];

  if (containsAny(text, ["deprecated", "deprecation", "retired", "retirement", "removed", "end of support", "sunset", "sunsetting"])) {
    tags.push("Deprecated");
  }

  if (containsAny(text, ["pricing", "price", "billing", "cost", "usage tier"])) {
    tags.push("Pricing");
  }

  if (containsAny(text, ["fixed", "fix", "bug", "resolved", "issue", "error", "reliability"])) {
    tags.push("Fixed");
  }

  if (containsAny(text, ["model", "opus", "sonnet", "haiku", "context window"])) {
    tags.push("Model update");
  }

  if (containsAny(text, ["api", "sdk", "console", "endpoint", "tool", "prompt caching", "beta header", "rate limit"])) {
    tags.push("API");
  }

  if (containsAny(text, ["launched", "released", "introduced", "added", "now available", "support for"])) {
    tags.push("New feature");
  }

  if (containsAny(text, ["updated", "improved", "enhanced", "expanded", "increased", "unified"])) {
    tags.push("Improvement");
  }

  if (containsAny(text, ["safety", "security", "privacy", "compliance", "hipaa", "protected health information"])) {
    tags.push("Safety");
  }

  return tags.length ? Array.from(new Set(tags)) : ["API"];
}

function normaliseDate(value) {
  const match = String(value || "").match(DATE_PATTERN);
  if (!match) {
    return "";
  }

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) {
    return "";
  }

  return `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}`;
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
    if (entry.summary.length > existing.summary.length) {
      existing.summary = entry.summary;
    }
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

function cleanMarkdownText(value) {
  return cleanText(
    String(value || "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\\*_~]/g, "")
  );
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
