import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOURCES = [
  {
    slug: "openai",
    url: "https://openai.com/news/rss.xml"
  },
  {
    slug: "gemini",
    url: "https://ai.google.dev/gemini-api/docs/changelog"
  },
  {
    slug: "claude",
    url: "https://platform.claude.com/docs/en/release-notes/overview"
  },
  {
    slug: "deepseek",
    url: "https://api-docs.deepseek.com/updates"
  }
];

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function cleanText(text) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSimpleItems(html, source) {
  const text = cleanText(html);

  return [{
    source_slug: source.slug,
    title: text.slice(0, 120) || `${source.slug} update`,
    url: source.url,
    published_at: new Date().toISOString(),
    summary: text.slice(0, 280),
    hash: hashText(source.slug + source.url + text.slice(0, 300))
  }];
}

export default async function handler(req, res) {
  const saved = [];

  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url);
      const html = await response.text();
      const items = extractSimpleItems(html, source);

      for (const item of items) {
        const { error } = await supabase
          .from("updates")
          .upsert(item, { onConflict: "hash" });

        if (!error) saved.push(item);
      }
    } catch (err) {
      saved.push({
        source_slug: source.slug,
        error: err.message
      });
    }
  }

  res.status(200).json({
    message: "Refresh completed",
    count: saved.length,
    saved
  });
}