import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGeminiChangelog } from "../scripts/sources/fetch-gemini.js";

const fixtureUrl = new URL("./fixtures/gemini-changelog.html", import.meta.url);

test("maps Gemini date headings and lists into changelog entries", async function () {
  const html = await readFile(fixtureUrl, "utf8");
  const entries = parseGeminiChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-07-06");
  assert.equal(entries[0].title, "Developer logs support for the");
  assert.equal(entries[0].summary, "• Developer logs support for the Interactions API is now available.");
  assert.deepEqual(entries[0].tags, ["API"]);
  assert.equal(entries[0].sourceUrl.endsWith("#july-6-2026"), true);
});

test("preserves nested Gemini list items in the summary", async function () {
  const html = await readFile(fixtureUrl, "utf8");
  const entries = parseGeminiChangelog(html);
  const juneEntry = entries.find(function (entry) {
    return entry.date === "2026-06-30";
  });

  assert.ok(juneEntry);
  assert.equal(juneEntry.title, "Gemini Omni Flash entered public");
  assert.match(juneEntry.summary, /• Gemini Omni Flash entered public preview\./);
  assert.match(juneEntry.summary, /  • Optimized for low latency\./);
  assert.match(juneEntry.summary, /  • Supports editing workflows\./);
});
