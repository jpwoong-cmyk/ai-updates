import test from "node:test";
import assert from "node:assert/strict";
import { parseXaiDeveloperChangelog } from "../scripts/sources/fetch-xai-developer.js";

test("official xAI HTML parses current and historical months", () => {
  const html = `
    <html><body>
      <nav><h2>Products</h2><div>Noise</div></nav>
      <main>
        <h1><a href="/developers/release-notes">Release Notes</a></h1>
        <h2>August</h2>
        <div>August 12</div>
        <h3>Grok 4.6</h3>
        <p>Grok 4.6 is now available on the xAI API.</p>
        <div>August 11</div>
        <h3>Grok Bot</h3>
        <p>Grok Bot is now available.</p>
        <h2>December 2025</h2>
        <div>Dec 16</div>
        <h3>Grok Speech to Speech API is released</h3>
        <p>Grok Speech to Speech API is generally available.</p>
      </main>
    </body></html>
  `;

  const items = parseXaiDeveloperChangelog(html);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "Grok 4.6");
  assert.equal(items[2].date, "2025-12-16");
});

test("official xAI parser keeps multiple releases on one date", () => {
  const html = `
    <main>
      <h1>Release Notes</h1>
      <h2>May 2026</h2>
      <div>May 29</div>
      <h3>Context Compaction</h3>
      <p>The Context Compaction API is now available.</p>
      <h3>WebSocket Responses API Mode</h3>
      <p>WebSocket Responses API mode is now available.</p>
    </main>
  `;

  const items = parseXaiDeveloperChangelog(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, "2026-05-29");
  assert.equal(items[1].date, "2026-05-29");
});
