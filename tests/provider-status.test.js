import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMicrosoftStatusHtml,
  parseXaiStatusHtml
} from "../lib/provider-status.js";

test("Microsoft Copilot direct operational state", () => {
  const parsed =
    parseMicrosoftStatusHtml(`
      <main>
        <h2>Microsoft consumer products</h2>
        <div>Microsoft Copilot Operational</div>
      </main>
    `);

  assert.equal(
    parsed.state,
    "operational"
  );

  assert.equal(
    parsed.statusLabel,
    "Operational"
  );
});

test("Microsoft consumer rollup can confirm Copilot operational", () => {
  const parsed =
    parseMicrosoftStatusHtml(`
      <main>
        <h2>Microsoft consumer products</h2>
        <div>Operational</div>
        <p>
          Service health information for Microsoft products and services.
        </p>
      </main>
    `);

  assert.equal(
    parsed.state,
    "operational"
  );
});

test("Microsoft Copilot degradation becomes non-healthy", () => {
  const parsed =
    parseMicrosoftStatusHtml(`
      <div>
        Microsoft Copilot Service degradation
      </div>
    `);

  assert.equal(
    parsed.state,
    "degraded"
  );
});

test("xAI aggregates Grok Web and API regions", () => {
  const parsed =
    parseXaiStatusHtml(`
      <h3>No incidents declared</h3>

      <div>
        Grok (Web) available
        API (us-east-1.api.x.ai) available
        API (us-west-2.api.x.ai) available
        API (eu-west-1.api.x.ai) available
      </div>
    `);

  assert.equal(
    parsed.state,
    "operational"
  );

  assert.equal(
    parsed.components.length,
    4
  );
});

test("xAI API disruption turns Grok provider status red", () => {
  const parsed =
    parseXaiStatusHtml(`
      <div>
        Grok (Web) available
        API (us-east-1.api.x.ai) disruption
        API (us-west-2.api.x.ai) available
        API (eu-west-1.api.x.ai) available
      </div>
    `);

  assert.equal(
    parsed.state,
    "degraded"
  );

  assert.match(
    parsed.message,
    /us-east-1/
  );
});
