import test from "node:test";
import assert from "node:assert/strict";

import {
  parseXaiProductChangelog
} from "../scripts/sources/fetch-xai.js";

test("parses valid visible Grok release notes", () => {
  const html = `
    <main>
      <h1>Release Notes</h1>

      <h2>August 28, 2026</h2>
      <h3>Voice mode gets faster</h3>
      <p>Voice mode now responds with lower latency.</p>

      <h2>August 20, 2026</h2>
      <h3>New Grok experience</h3>
      <p>A new experience is rolling out to Grok users.</p>
    </main>
  `;

  const entries =
    parseXaiProductChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-08-28");
  assert.equal(entries[0].title, "Voice mode gets faster");
});

test("accepts structured ISO release objects", () => {
  const html = `
    <script type="application/json">
      {
        "releaseNotes": [
          {
            "releaseDate": "2026-08-18",
            "title": "Grok adds workspace mode",
            "summary": "Workspace mode is now available to users."
          },
          {
            "publishedAt": "2026-08-10T09:00:00Z",
            "headline": "Grok improves search",
            "description": "Search now returns better results."
          }
        ]
      }
    </script>
  `;

  const entries =
    parseXaiProductChangelog(html);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-08-18");
  assert.equal(entries[1].date, "2026-08-10");
});

test("rejects bogus JavaScript date interpretations", () => {
  const html = `
    <script type="application/json">
      {
        "config": [
          {
            "date": "29999",
            "title": "backend_detection",
            "description": "Internal client configuration."
          },
          {
            "date": "11999",
            "title": "extra_suggestions",
            "description": "Internal client configuration."
          },
          {
            "date": "9999",
            "title": "a8:",
            "description": "Internal key."
          }
        ],
        "releaseNotes": [
          {
            "releaseDate": "2026-08-29",
            "title": "Real Grok release",
            "summary": "A real product update for Grok."
          }
        ]
      }
    </script>
  `;

  const entries =
    parseXaiProductChangelog(html);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-08-29");
  assert.equal(entries[0].title, "Real Grok release");
});
