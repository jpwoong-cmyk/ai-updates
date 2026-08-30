import test from "node:test";
import assert from "node:assert/strict";

import {
  parseXaiDeveloperChangelog
} from "../scripts/sources/fetch-xai-developer.js";

test("xAI developer release notes", () => {
  const markdown = `
# Release Notes

## August

August 12

### Grok 4.6

Grok 4.6 is now available on the xAI API with a 500k context window.
Pricing is $2 per 1M input tokens.

## December 2025

Dec 16

### Grok Speech to Speech API is released

Grok Speech to Speech API is generally available.
`;

  const entries = parseXaiDeveloperChangelog(markdown);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-08-12");
  assert.equal(entries[0].audience, "developer");
  assert.ok(entries[0].tags.includes("API"));
});
