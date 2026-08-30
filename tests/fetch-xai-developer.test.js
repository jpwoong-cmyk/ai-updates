import test from "node:test";
import assert from "node:assert/strict";

import {
  parseXaiDeveloperChangelog
} from "../scripts/sources/fetch-xai-developer.js";

test("parses xAI HTML developer release notes", () => {
  const html = `
    <main>
      <nav>
        <h2>Products</h2>
        <p>Noise before the article.</p>
      </nav>

      <h1>Release Notes</h1>

      <h2>August</h2>
      <p>August 12</p>

      <h3>Grok 4.6</h3>
      <p>
        Grok 4.6 is now available on the xAI API.
        It has a 500k context window.
      </p>

      <p>August 11</p>
      <h3>Grok Bot</h3>
      <p>Grok Bot is now available.</p>

      <h2>December 2025</h2>
      <p>Dec 16</p>
      <h3>Grok Speech to Speech API is released</h3>
      <p>Grok Speech to Speech API is generally available.</p>
    </main>
  `;

  const entries =
    parseXaiDeveloperChangelog(html);

  assert.equal(entries.length, 3);
  assert.equal(entries[0].date, "2026-08-12");
  assert.equal(entries[0].title, "Grok 4.6");
  assert.equal(entries[0].audience, "developer");

  assert.equal(entries[1].date, "2026-08-11");
  assert.equal(entries[2].date, "2025-12-16");
});

test("keeps multiple releases on one date", () => {
  const html = `
    <h1>Release Notes</h1>
    <h2>May 2026</h2>

    <p>May 29</p>

    <h3>Context Compaction</h3>
    <p>Context Compaction API is available.</p>

    <h3>WebSocket Responses API Mode</h3>
    <p>WebSocket mode is available.</p>
  `;

  const entries =
    parseXaiDeveloperChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-05-29");
  assert.equal(entries[1].date, "2026-05-29");
});
