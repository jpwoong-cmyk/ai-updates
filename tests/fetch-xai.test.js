import test from "node:test";
import assert from "node:assert/strict";

import {
  parseXaiProductChangelog
} from "../scripts/sources/fetch-xai.js";

test("visible Grok release notes", () => {
  const html = `
    <main>
      <h1>Release Notes</h1>
      <h2>August 28, 2026</h2>
      <h3>Voice mode gets faster</h3>
      <p>Voice mode now responds with lower latency and smoother interruptions.</p>

      <h2>August 20, 2026</h2>
      <h3>New Grok experience</h3>
      <p>We introduced a new feature for Grok users.</p>
    </main>
  `;

  const entries = parseXaiProductChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-08-28");
  assert.equal(entries[0].providerId, "xai");
  assert.equal(entries[0].audience, "product");
  assert.equal(entries[0].product, "Grok");
});

test("embedded JSON Grok release notes", () => {
  const html = `
    <div id="__next"></div>
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "releaseNotes": [
            {
              "releaseDate": "2026-08-18",
              "title": "Grok adds a new workspace",
              "summary": "A new workspace is now available for users."
            },
            {
              "publishedAt": "2026-08-10T09:00:00Z",
              "headline": "Grok improves search",
              "description": "Search is faster and returns better results."
            }
          ]
        }
      }
    </script>
  `;

  const entries = parseXaiProductChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-08-18");
  assert.equal(entries[1].date, "2026-08-10");
});

test("deduplicates releases found twice", () => {
  const html = `
    <main>
      <h2>August 28, 2026</h2>
      <h3>Grok gets faster</h3>
      <p>Performance improvements make Grok faster.</p>
    </main>

    <script type="application/json">
      {
        "items": [
          {
            "date": "2026-08-28",
            "title": "Grok gets faster",
            "summary": "Performance improvements make Grok faster and smoother."
          }
        ]
      }
    </script>
  `;

  const entries = parseXaiProductChangelog(html);

  assert.equal(entries.length, 1);
  assert.match(entries[0].summary, /smoother/);
});
