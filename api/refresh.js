import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOURCES = [
  {
    slug: "openai",
    type: "rss",
    url: "https://openai.com/news/rss.xml"
  },
  {
    slug: "gemini",
    type: "manual",
    url: "https://ai.google.dev/gemini-api/docs/changelog",
    title: "Gemini API Changelog"
  },
  {
    slug: "claude",
    type: "manual",
    url: "https://platform.claude.com/docs/en/release-notes/overview",
    title: "Claude Platform Release Notes"
  },
  {
    slug: "deepseek",
    type: "manual",
    url: "https://api-docs.deepseek.com/updates",
    title: "DeepSeek API Change Log"
  }
];

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function stripTags(text = "") {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .slice(0, 5)
    .map(match => {
      const block = match[0];

      const title = getTag(block, "title") || "Untitled update";
      const link = getTag(block, "link") || source.url;
      const pubDate = getTag(block, "pubDate");
      const description = getTag(block, "description");

      return {
        source_slug: source.slug,
        title,
        url: link,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        summary: description.slice(0, 260),
        hash: hashText(source.slug + title + link)
      };
    });

  return items;
}

function parseManual(source) {
  return [{
    source_slug: source.slug,
    title: source.title,
    url: source.url,
    published_at: new Date().toISOString(),
    summary: "Official update source. Detailed item extraction will be added in the next version.",
    hash: hashText(source.slug + source.url + new Date().toISOString().slice(0, 10))
  }];
}

function extractByDateBlocks(html, source) {
  const text = stripTags(html)
    .replace(/\s+/g, " ")
    .trim();

  const dateRegex =
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}/gi;

  const matches = [...text.matchAll(dateRegex)];

  if (!matches.length) {
    return [{
      source_slug: source.slug,
      title: source.title,
      url: source.url,
      published_at: new Date().toISOString(),
      summary: "Could not detect individual changelog entries yet.",
      hash: hashText(source.slug + source.url + "fallback")
    }];
  }

  return matches.slice(0, 5).map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index || text.length;

    const block = text.slice(start, end).trim();
    const dateText = match[0];

    const summary = block
      .replace(dateText, "")
      .trim()
      .slice(0, 260);

    return {
      source_slug: source.slug,
      title: `${source.title} - ${dateText}`,
      url: source.url,
      published_at: new Date(dateText).toISOString(),
      summary,
      hash: hashText(source.slug + source.url + dateText + summary.slice(0, 80))
    };
  });
}

export default async function handler(req, res) {
  const results = [];

  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url);
      const text = await response.text();

        const items = source.type === "rss"
        ? parseRss(text, source)
        : extractByDateBlocks(text, source);

      for (const item of items) {
        const { error } = await supabase
          .from("updates")
          .upsert(item, { onConflict: "hash" });

        results.push({
          source: source.slug,
          title: item.title,
          status: error ? "failed" : "saved",
          error: error?.message || null
        });
      }
    } catch (err) {
      results.push({
        source: source.slug,
        status: "failed",
        error: err.message
      });
    }
  }

  res.status(200).json({
    message: "Refresh completed",
    results
  });
}