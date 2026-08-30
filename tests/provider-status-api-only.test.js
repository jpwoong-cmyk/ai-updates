import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMicrosoftServiceStatusJson,
  parseXaiStatusRss,
  mapMicrosoftStatus
} from "../lib/provider-status.js";

test("Microsoft JSON parser finds a healthy Copilot component in nested data", () => {
  const payload = {
    groups: [
      {
        name: "Microsoft consumer products",
        services: [
          {
            displayName: "Microsoft Copilot",
            status: "Operational"
          },
          {
            displayName: "Outlook.com",
            status: "Operational"
          }
        ]
      }
    ]
  };

  const result =
    parseMicrosoftServiceStatusJson(payload);

  assert.ok(result);
  assert.equal(
    result.state,
    "operational"
  );
  assert.equal(
    result.statusLabel,
    "Operational"
  );
});

test("Microsoft JSON parser finds Copilot degradation", () => {
  const payload = {
    services: [
      {
        serviceName: "Microsoft 365 Copilot Chat",
        currentStatus: "Service degradation",
        userImpact:
          "Some users may be unable to access Copilot Chat."
      }
    ]
  };

  const result =
    parseMicrosoftServiceStatusJson(payload);

  assert.ok(result);
  assert.equal(
    result.state,
    "degraded"
  );
  assert.match(
    result.message,
    /unable to access/
  );
});

test("Microsoft state mapper handles outage and maintenance", () => {
  assert.equal(
    mapMicrosoftStatus("Critical outage").state,
    "major_outage"
  );

  assert.equal(
    mapMicrosoftStatus("Under maintenance").state,
    "maintenance"
  );
});

test("xAI RSS parser ignores resolved old incidents", () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title>Grok temporarily unavailable</title>
          <description><![CDATA[
            Resolved - Grok service has returned to normal.
          ]]></description>
          <link>https://status.x.ai/incidents/old</link>
          <pubDate>Mon, 17 Aug 2026 21:57:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
  `;

  const result =
    parseXaiStatusRss(xml);

  assert.equal(
    result.items.length,
    1
  );
  assert.equal(
    result.activeIncidents.length,
    0
  );
});

test("xAI RSS parser detects active disruption", () => {
  const future = new Date(
    Date.now() - 60 * 60 * 1000
  ).toUTCString();

  const xml = `
    <rss>
      <channel>
        <item>
          <title>Increased error rates for Grok</title>
          <description><![CDATA[
            Investigating - We are investigating increased error rates.
          ]]></description>
          <link>https://status.x.ai/incidents/live</link>
          <pubDate>${future}</pubDate>
        </item>
      </channel>
    </rss>
  `;

  const result =
    parseXaiStatusRss(xml);

  assert.equal(
    result.activeIncidents.length,
    1
  );

  assert.equal(
    result.activeIncidents[0].link,
    "https://status.x.ai/incidents/live"
  );
});
