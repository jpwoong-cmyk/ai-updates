export const XAI_DEVELOPER_CHANGELOG_URL =
  "https://docs.x.ai/developers/release-notes";

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

const DATE_PATTERN =
  new RegExp(
    `^${MONTH_NAME_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`,
    "i"
  );

const MONTH_HEADING_PATTERN =
  new RegExp(
    `^${MONTH_NAME_PATTERN}(?:\\s+(\\d{4}))?$`,
    "i"
  );

export async function fetchXaiDeveloperChangelog(options = {}) {
  const fetchImpl =
    options.fetchImpl ||
    globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error(
      "A fetch implementation is required."
    );
  }

  const response =
    await fetchImpl(
      XAI_DEVELOPER_CHANGELOG_URL,
      {
        headers: {
          Accept:
            "text/html,application/xhtml+xml",
          "Accept-Language":
            "en-US,en;q=0.9",
          "User-Agent":
            "Mini-AI-Encyclopedia/1.4 (+https://vercel.com)"
        },
        redirect: "follow"
      }
    );

  if (!response.ok) {
    throw new Error(
      `xAI developer release-notes request failed with HTTP ${response.status}.`
    );
  }

  return parseXaiDeveloperChangelog(
    await response.text()
  );
}

export function parseXaiDeveloperChangelog(html) {
  if (
    typeof html !== "string" ||
    !html.trim()
  ) {
    throw new Error(
      "xAI developer release-notes HTML was empty."
    );
  }

  const tokens =
    extractSemanticTokens(html);

  const releaseHeadingIndex =
    tokens.findIndex((token) =>
      token.tag === "h1" &&
      /^release notes$/i.test(
        token.text
      )
    );

  if (releaseHeadingIndex < 0) {
    throw new Error(
      "Could not find the xAI Release Notes heading. xAI may have changed the page markup."
    );
  }

  const contentTokens =
    tokens.slice(
      releaseHeadingIndex + 1
    );

  let currentYear =
    inferStartingYear(
      contentTokens
    );

  let currentDate = "";
  let currentTitle = "";
  let summaryLines = [];

  const entries = [];

  function flush() {
    if (
      currentDate &&
      currentTitle &&
      summaryLines.length
    ) {
      const summary =
        formatSummary(
          summaryLines
        );

      if (summary) {
        entries.push({
          id:
            `xai-${currentDate}-${slugify(currentTitle)}`,
          providerId: "xai",
          providerName: "xAI",
          product:
            "Grok / xAI API",
          audience: "developer",
          title: currentTitle,
          date: currentDate,
          datePrecision: "day",
          summary,
          tags:
            classifyXaiTags(
              currentTitle,
              summary
            ),
          sourceUrl:
            XAI_DEVELOPER_CHANGELOG_URL
        });
      }
    }

    currentTitle = "";
    summaryLines = [];
  }

  for (
    const token
    of contentTokens
  ) {
    const text =
      token.text;

    if (!text) {
      continue;
    }

    if (token.tag === "h2") {
      const monthMatch =
        text.match(
          MONTH_HEADING_PATTERN
        );

      if (!monthMatch) {
        continue;
      }

      flush();

      if (monthMatch[2]) {
        currentYear =
          Number(monthMatch[2]);
      }

      currentDate = "";
      continue;
    }

    const dateMatch =
      text.match(
        DATE_PATTERN
      );

    if (
      token.tag !== "h3" &&
      dateMatch
    ) {
      flush();

      const explicitYear =
        dateMatch[3]
          ? Number(dateMatch[3])
          : currentYear;

      currentDate =
        normaliseDate(
          dateMatch[1],
          dateMatch[2],
          explicitYear
        );

      continue;
    }

    if (token.tag === "h3") {
      flush();

      if (
        currentDate &&
        !/^release notes$/i.test(text)
      ) {
        currentTitle = text;
      }

      continue;
    }

    if (
      currentDate &&
      currentTitle &&
      (
        token.tag === "p" ||
        token.tag === "li"
      )
    ) {
      summaryLines.push(
        token.tag === "li"
          ? `• ${text}`
          : text
      );
    }
  }

  flush();

  const deduplicated =
    deduplicateEntries(entries)
      .sort(
        (first, second) =>
          second.date.localeCompare(
            first.date
          )
      );

  if (!deduplicated.length) {
    throw new Error(
      "xAI Release Notes loaded, but no dated developer releases could be extracted."
    );
  }

  return deduplicated;
}

function extractSemanticTokens(html) {
  const cleanedHtml =
    html.replace(
      /<script\b[\s\S]*?<\/script>/gi,
      " "
    );

  const pattern =
    /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  const tokens = [];
  let match;

  while (
    (match = pattern.exec(
      cleanedHtml
    ))
  ) {
    const text =
      cleanHtmlText(
        match[2]
      );

    if (!text) {
      continue;
    }

    tokens.push({
      tag:
        match[1].toLowerCase(),
      text
    });
  }

  return tokens;
}

function inferStartingYear(tokens) {
  let sawYearlessMonth =
    false;

  for (const token of tokens) {
    if (
      token.tag !== "h2"
    ) {
      continue;
    }

    const match =
      token.text.match(
        MONTH_HEADING_PATTERN
      );

    if (!match) {
      continue;
    }

    if (match[2]) {
      const explicitYear =
        Number(match[2]);

      return sawYearlessMonth
        ? explicitYear + 1
        : explicitYear;
    }

    sawYearlessMonth = true;
  }

  return new Date()
    .getUTCFullYear();
}

function normaliseDate(
  monthName,
  day,
  year
) {
  const month =
    MONTH_NUMBERS[
      String(monthName)
        .toLowerCase()
    ];

  if (!month) {
    return "";
  }

  const numericDay =
    Number(day);

  const numericYear =
    Number(year);

  if (
    !Number.isInteger(numericDay) ||
    numericDay < 1 ||
    numericDay > 31 ||
    !Number.isInteger(numericYear) ||
    numericYear < 2023 ||
    numericYear >
      new Date()
        .getUTCFullYear() + 1
  ) {
    return "";
  }

  return (
    `${numericYear}-${month}-` +
    `${String(numericDay).padStart(2, "0")}`
  );
}

function formatSummary(lines) {
  return lines
    .map((line) =>
      String(line || "")
        .trim()
    )
    .filter(Boolean)
    .join("\n")
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function cleanHtmlText(value) {
  return decodeEntities(
    String(value || "")
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<\/(?:p|li)>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n[ \t]+/g,
      "\n"
    )
    .replace(
      /\s*\n\s*/g,
      "\n"
    )
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

function classifyXaiTags(
  title,
  summary
) {
  const text =
    `${title} ${summary}`
      .toLowerCase();

  const tags =
    new Set(["API"]);

  if (
    /\bgrok\s+\d|\bmodel\b|model slug|reasoning effort|context window/.test(text)
  ) {
    tags.add("Model update");
  }

  if (
    /\bavailable\b|\breleased?\b|\blaunch(?:ed)?\b|\bnow supports\b|\bnew\b/.test(text)
  ) {
    tags.add("New feature");
  }

  if (
    /improv|faster|lower latency|support(?:s|ed)?|integration|enhanc/.test(text)
  ) {
    tags.add("Improvement");
  }

  if (
    /deprecat|retir|sunset|end of life|eol/.test(text)
  ) {
    tags.add("Deprecated");
  }

  if (
    /price|pricing|cost|billed|token rate/.test(text)
  ) {
    tags.add("Pricing");
  }

  if (/fix|fixed|bug/.test(text)) {
    tags.add("Fixed");
  }

  if (
    /safety|guard|secure|security|privacy/.test(text)
  ) {
    tags.add("Safety");
  }

  return Array.from(tags);
}

function deduplicateEntries(entries) {
  const seen =
    new Map();

  entries.forEach(
    (entry) => {
      const key =
        `${entry.date}|${entry.title
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim()}`;

      if (!seen.has(key)) {
        seen.set(
          key,
          entry
        );

        return;
      }

      const existing =
        seen.get(key);

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
  );

  return Array.from(
    seen.values()
  );
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 72) ||
    "release";
}
