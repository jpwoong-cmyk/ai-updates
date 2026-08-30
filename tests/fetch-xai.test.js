import test from "node:test";
import assert from "node:assert/strict";
import {
  parseXaiProductJson,
  parseXaiProductMarkdown,
  parseXaiProductHtml
} from "../scripts/sources/fetch-xai.js";

test("JSON mirror keeps release-note entries only", () => {
  const raw = JSON.stringify({
    releases: [
      {
        date: "2026-07-16",
        title: "Automations run on schedule or email triggers",
        summary: "Release Notes. Automations run user-defined instructions on a schedule.",
        sourceUrl: "https://grok.com/release-notes"
      },
      {
        date: "2026-06-27",
        title: "Grok - AI Chat & Video v1.3.95",
        summary: "Available for iOS",
        sourceUrl: "https://apps.apple.com/app/grok"
      }
    ]
  });

  const items = parseXaiProductJson(raw);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, "2026-07-16");
});

test("Markdown mirror extracts release notes", () => {
  const markdown = `
# Grok
Jul 16, 2026
## Automations run on schedule or email triggers
Release Notes
Automations run user-defined instructions on a schedule or when matching emails arrive.
Read more →
Jul 1, 2026
## iOS dictation shortcut launched
Release Notes
Grok iOS adds a Dictate to Grok shortcut.
Read more →
`;

  const items = parseXaiProductMarkdown(markdown);
  assert.equal(items.length, 2);
});

test("HTML mirror excludes App Store cards", () => {
  const html = `
    <main>
      <div>Jul 16, 2026</div>
      <section>
        <h2>Automations run on schedule or email triggers</h2>
        <div>Release Notes</div>
        <p>Automations can run on schedules and email triggers.</p>
        <a href="https://grok.com/release-notes">Read more →</a>
      </section>
      <div>Jun 27, 2026</div>
      <section>
        <h2>Grok - AI Chat & Video v1.3.95</h2>
        <p>Available for iOS</p>
      </section>
    </main>
  `;

  const items = parseXaiProductHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, "2026-07-16");
});
