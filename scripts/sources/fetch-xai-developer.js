export const XAI_DEVELOPER_CHANGELOG_URL =
  "https://docs.x.ai/developers/release-notes";

export const XAI_DEVELOPER_MARKDOWN_URL =
  "https://docs.x.ai/developers/release-notes.md";

const MONTH_NUMBERS = {
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

const MONTH_NAME_PATTERN =
  "(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)";

const DATE_PATTERN = new RegExp(
  `^${MONTH_NAME_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`,
  "i"
);

const MONTH_HEADING_PATTERN = new RegExp(
  `^${MONTH_NAME_PATTERN}(?:\\s+(\\d{4}))?$`,
  "i"
);

export async function fetchXaiDeveloperChangelog(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(XAI_DEVELOPER_MARKDOWN_URL, {
    headers: {
      Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mini-AI-Encyclopedia/1.3 (+https://vercel.com)"
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

export function parseXaiDeveloperChangelog(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new Error("xAI developer release-notes Markdown was empty.");
  }

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let currentYear = inferStartingYear(lines);
  let currentDate = "";
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    const monthHeading = readHeading(trimmed, 2);

    if (monthHeading) {
      const monthMatch =
        cleanInlineMarkdown(monthHeading).match(MONTH_HEADING_PATTERN);

      if (monthMatch && monthMatch[2]) {
        currentYear = Number(monthMatch[2]);
      }

      continue;
    }

    const dateText = cleanInlineMarkdown(trimmed);
    const dateMatch = dateText.match(DATE_PATTERN);

    if (dateMatch) {
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

    const titleHeading = readHeading(trimmed, 3);

    if (!titleHeading || !currentDate) {
      continue;
    }

    const title = cleanInlineMarkdown(titleHeading);

    if (!title || /^release notes$/i.test(title)) {
      continue;
    }

    const summaryLines = [];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const candidateRaw = lines[cursor];
      const candidate = candidateRaw.trim();

      if (
        readHeading(candidate, 2) ||
        readHeading(candidate, 3) ||
        cleanInlineMarkdown(candidate).match(DATE_PATTERN)
      ) {
        break;
      }

      summaryLines.push(candidateRaw);
      cursor += 1;
    }

    const summary = formatSummary(summaryLines);

    if (summary) {
      entries.push({
        id: `xai-${currentDate}-${slugify(title)}`,
        providerId: "xai",
        providerName: "xAI",
        product: "Grok / xAI API",
        audience: "developer",
        title,
        date: currentDate,
        datePrecision: "day",
        summary,
        tags: classifyXaiTags(title, summary),
        sourceUrl: XAI_DEVELOPER_CHANGELOG_URL
      });
    }

    index = cursor - 1;
  }

  const deduplicated = deduplicateEntries(entries)
    .sort((first, second) => second.date.localeCompare(first.date));

  if (!deduplicated.length) {
    throw new Error(
      "xAI release-note dates were found, but no release entries could be extracted."
    );
  }

  return deduplicated;
}

function inferStartingYear(lines) {
  let sawYearlessMonthBeforeExplicitYear = false;

  for (const rawLine of lines) {
    const heading = readHeading(rawLine.trim(), 2);
    if (!heading) continue;

    const match =
      cleanInlineMarkdown(heading).match(MONTH_HEADING_PATTERN);

    if (!match) continue;

    if (match[2]) {
      const explicitYear = Number(match[2]);

      return sawYearlessMonthBeforeExplicitYear
        ? explicitYear + 1
        : explicitYear;
    }

    sawYearlessMonthBeforeExplicitYear = true;
  }

  return new Date().getUTCFullYear();
}

function readHeading(line, level) {
  const prefix = `${"#".repeat(level)} `;

  if (!line.startsWith(prefix)) {
    return "";
  }

  if (level === 2 && line.startsWith("### ")) {
    return "";
  }

  return line.slice(prefix.length).trim();
}

function normaliseDate(monthName, day, year) {
  const month = MONTH_NUMBERS[String(monthName).toLowerCase()];

  if (!month) return "";

  const numericDay = Number(day);
  const numericYear = Number(year);

  if (
    !Number.isInteger(numericDay) ||
    numericDay < 1 ||
    numericDay > 31 ||
    !Number.isInteger(numericYear)
  ) {
    return "";
  }

  return `${numericYear}-${month}-${String(numericDay).padStart(2, "0")}`;
}

function formatSummary(lines) {
  const output = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (output.length && output[output.length - 1] !== "") {
        output.push("");
      }

      continue;
    }

    if (/^```/.test(trimmed)) {
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);

    if (bulletMatch) {
      output.push(`• ${cleanInlineMarkdown(bulletMatch[1])}`);
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (numberedMatch) {
      output.push(`• ${cleanInlineMarkdown(numberedMatch[1])}`);
      continue;
    }

    const cleaned = cleanInlineMarkdown(trimmed);

    if (cleaned) {
      output.push(cleaned);
    }
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInlineMarkdown(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyXaiTags(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = new Set(["API"]);

  if (/\bgrok\s+\d|\bmodel\b|model slug|reasoning effort|context window/.test(text)) {
    tags.add("Model update");
  }

  if (/\bavailable\b|\breleased?\b|\blaunch(?:ed)?\b|\bnow supports\b|\bnew\b/.test(text)) {
    tags.add("New feature");
  }

  if (/improv|faster|lower latency|support(?:s|ed)?|integration|enhanc/.test(text)) {
    tags.add("Improvement");
  }

  if (/deprecat|retir|sunset|end of life|eol/.test(text)) {
    tags.add("Deprecated");
  }

  if (/price|pricing|cost|billed|token rate/.test(text)) {
    tags.add("Pricing");
  }

  if (/fix|fixed|bug/.test(text)) {
    tags.add("Fixed");
  }

  if (/safety|guard|secure|security|privacy/.test(text)) {
    tags.add("Safety");
  }

  return Array.from(tags);
}

function deduplicateEntries(entries) {
  const seen = new Map();

  entries.forEach((entry) => {
    const key =
      `${entry.date}|${entry.title.toLowerCase().replace(/\s+/g, " ").trim()}`;

    if (!seen.has(key)) {
      seen.set(key, entry);
      return;
    }

    const existing = seen.get(key);

    if (entry.summary.length > existing.summary.length) {
      existing.summary = entry.summary;
    }

    existing.tags = Array.from(
      new Set(existing.tags.concat(entry.tags))
    );
  });

  return Array.from(seen.values());
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "release";
}
