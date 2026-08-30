const STATUS_RANK = {
  operational: 0,
  reachable: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
  unknown: 5
};

const PROVIDER_META = {
  openai: {
    id: "openai",
    label: "ChatGPT",
    company: "OpenAI",
    statusUrl: "https://status.openai.com/"
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    company: "Anthropic",
    statusUrl: "https://status.claude.com/"
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    company: "Google",
    statusUrl:
      "https://www.google.com/appsstatus/dashboard/products/npdyhgECDJ6tB66MxXyo/history"
  },
  copilot: {
    id: "copilot",
    label: "Copilot",
    company: "Microsoft",
    statusUrl: "https://status.cloud.microsoft/"
  },
  xai: {
    id: "xai",
    label: "Grok",
    company: "xAI",
    statusUrl: "https://status.x.ai/"
  }
};

const GEMINI_PRODUCT_ID = "npdyhgECDJ6tB66MxXyo";

const MICROSOFT_STATUS_API =
  "https://portal.office.com/api/servicestatus/index";

const XAI_STATUS_RSS =
  "https://status.x.ai/feed.xml";

export async function getAllProviderStatuses({
  fetchImpl = globalThis.fetch,
  timeoutMs = 6500
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const checkedAt = new Date().toISOString();

  const providers = await Promise.all([
    safeCheck(
      () => checkOpenAI(fetchImpl, timeoutMs),
      PROVIDER_META.openai
    ),
    safeCheck(
      () => checkClaude(fetchImpl, timeoutMs),
      PROVIDER_META.anthropic
    ),
    safeCheck(
      () => checkGemini(fetchImpl, timeoutMs),
      PROVIDER_META.gemini
    ),
    safeCheck(
      () => checkCopilot(fetchImpl, timeoutMs),
      PROVIDER_META.copilot
    ),
    safeCheck(
      () => checkGrok(fetchImpl, timeoutMs),
      PROVIDER_META.xai
    )
  ]);

  return {
    checkedAt,
    sourceMode: "api-only",
    healthyCount:
      providers.filter((item) => item.healthy).length,
    issueCount:
      providers.filter((item) => !item.healthy).length,
    providers
  };
}


/* ------------------------------------------------------------------
 * OPENAI
 * ------------------------------------------------------------------ */

export async function checkOpenAI(fetchImpl, timeoutMs) {
  const url =
    "https://status.openai.com/api/v2/summary.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.2"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI status returned HTTP ${response.status}.`
    );
  }

  const payload = await response.json();

  const pageStatus =
    mapStatuspageIndicator(
      payload?.status?.indicator,
      payload?.status?.description
    );

  const components =
    Array.isArray(payload?.components)
      ? payload.components
      : [];

  const nonOperational =
    components.filter(
      (component) =>
        component?.status &&
        component.status !== "operational"
    );

  const incidents =
    Array.isArray(payload?.incidents)
      ? payload.incidents.filter(
          (incident) =>
            incident &&
            incident.status !== "resolved" &&
            incident.status !== "postmortem"
        )
      : [];

  let state = pageStatus.state;
  let statusLabel = pageStatus.label;

  if (nonOperational.length) {
    const worst = worstState(
      nonOperational.map((component) =>
        mapStatuspageComponent(component.status)
      )
    );

    if (
      STATUS_RANK[worst.state] >
      STATUS_RANK[state]
    ) {
      state = worst.state;
      statusLabel = worst.label;
    }
  }

  return buildProviderStatus(
    PROVIDER_META.openai,
    {
      state,
      statusLabel,
      message:
        nonOperational.length
          ? nonOperational
              .slice(0, 4)
              .map(
                (component) =>
                  `${component.name}: ${humaniseToken(component.status)}`
              )
              .join(" · ")
          : (
            incidents[0]?.name ||
            payload?.status?.description ||
            "OpenAI services operational."
          ),
      incidentUrl:
        incidents[0]?.shortlink ||
        PROVIDER_META.openai.statusUrl,
      source: url,
      sourceType: "statuspage-json",
      components:
        components.slice(0, 12).map((component) => ({
          name: component.name,
          status: component.status
        }))
    }
  );
}


/* ------------------------------------------------------------------
 * CLAUDE / ANTHROPIC
 * ------------------------------------------------------------------ */

export async function checkClaude(fetchImpl, timeoutMs) {
  const url =
    "https://status.claude.com/api/v2/summary.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.2"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(
      `Claude status returned HTTP ${response.status}.`
    );
  }

  const payload = await response.json();

  const components =
    Array.isArray(payload?.components)
      ? payload.components
      : [];

  const relevant =
    components.filter((component) => {
      const name =
        String(component?.name || "").toLowerCase();

      return (
        name === "claude.ai" ||
        name.includes("claude api") ||
        name.includes("api.anthropic.com")
      );
    });

  const effective =
    relevant.length ? relevant : components;

  const worst =
    effective.length
      ? worstState(
          effective.map((component) =>
            mapStatuspageComponent(component.status)
          )
        )
      : mapStatuspageIndicator(
          payload?.status?.indicator,
          payload?.status?.description
        );

  const unhealthy =
    effective.filter(
      (component) =>
        component?.status &&
        component.status !== "operational"
    );

  const incidents =
    Array.isArray(payload?.incidents)
      ? payload.incidents.filter(
          (incident) =>
            incident &&
            incident.status !== "resolved" &&
            incident.status !== "postmortem"
        )
      : [];

  return buildProviderStatus(
    PROVIDER_META.anthropic,
    {
      state: worst.state,
      statusLabel: worst.label,
      message:
        unhealthy.length
          ? unhealthy
              .map(
                (component) =>
                  `${component.name}: ${humaniseToken(component.status)}`
              )
              .join(" · ")
          : (
            incidents[0]?.name ||
            payload?.status?.description ||
            "Claude services operational."
          ),
      incidentUrl:
        incidents[0]?.shortlink ||
        PROVIDER_META.anthropic.statusUrl,
      source: url,
      sourceType: "statuspage-json",
      components:
        effective.map((component) => ({
          name: component.name,
          status: component.status
        }))
    }
  );
}


/* ------------------------------------------------------------------
 * GEMINI
 * ------------------------------------------------------------------ */

export async function checkGemini(fetchImpl, timeoutMs) {
  const url =
    "https://www.google.com/appsstatus/dashboard/incidents.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.2"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(
      `Google status returned HTTP ${response.status}.`
    );
  }

  const incidents = await response.json();

  const geminiIncidents =
    Array.isArray(incidents)
      ? incidents.filter(isGeminiIncident)
      : [];

  const active =
    geminiIncidents.filter(isGoogleIncidentActive);

  if (!active.length) {
    return buildProviderStatus(
      PROVIDER_META.gemini,
      {
        state: "operational",
        statusLabel: "Operational",
        message:
          "No active Gemini incidents reported.",
        incidentUrl: PROVIDER_META.gemini.statusUrl,
        source: url,
        sourceType: "google-incidents-json",
        components: [
          {
            name: "Gemini",
            status: "available"
          }
        ]
      }
    );
  }

  const incident =
    [...active].sort(
      (a, b) =>
        Date.parse(
          b?.modified ||
          b?.created ||
          0
        ) -
        Date.parse(
          a?.modified ||
          a?.created ||
          0
        )
    )[0];

  const latestStatus =
    String(
      incident?.most_recent_update?.status ||
      incident?.updates?.[
        (incident.updates?.length || 1) - 1
      ]?.status ||
      incident?.status_impact ||
      ""
    ).toUpperCase();

  const mapped =
    mapGoogleStatus(
      latestStatus,
      incident?.severity
    );

  const incidentId =
    incident?.id ||
    String(incident?.uri || "").split("/").pop();

  return buildProviderStatus(
    PROVIDER_META.gemini,
    {
      state: mapped.state,
      statusLabel: mapped.label,
      message:
        extractGoogleSummary(
          incident?.most_recent_update?.text ||
          incident?.external_desc ||
          ""
        ) ||
        "Google reports an active Gemini incident.",
      incidentUrl:
        incidentId
          ? `https://www.google.com/appsstatus/dashboard/incidents/${encodeURIComponent(incidentId)}`
          : PROVIDER_META.gemini.statusUrl,
      source: url,
      sourceType: "google-incidents-json",
      components: [
        {
          name: "Gemini",
          status:
            latestStatus ||
            incident?.status_impact ||
            "incident"
        }
      ]
    }
  );
}


/* ------------------------------------------------------------------
 * COPILOT / MICROSOFT
 *
 * 1. Try Microsoft's anonymous machine-readable Service Status API.
 * 2. If Microsoft retires/blocks it, probe the actual Copilot web service.
 *
 * This deliberately reports "Reachable" rather than claiming detailed
 * Microsoft service-health information when only the service probe works.
 * ------------------------------------------------------------------ */

export async function checkCopilot(fetchImpl, timeoutMs) {
  const apiResult =
    await tryMicrosoftServiceStatusApi(
      fetchImpl,
      timeoutMs
    );

  if (apiResult) {
    return buildProviderStatus(
      PROVIDER_META.copilot,
      {
        ...apiResult,
        source: MICROSOFT_STATUS_API,
        sourceType: "microsoft-service-status-json"
      }
    );
  }

  return probeCopilotService(
    fetchImpl,
    timeoutMs
  );
}

export async function tryMicrosoftServiceStatusApi(
  fetchImpl,
  timeoutMs
) {
  try {
    const response =
      await fetchWithTimeout(
        fetchImpl,
        MICROSOFT_STATUS_API,
        {
          headers: {
            Accept:
              "application/json, text/plain, */*",
            Referer:
              "https://portal.office.com/ServiceStatus",
            Origin:
              "https://portal.office.com",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 Chrome/152 Safari/537.36"
          }
        },
        timeoutMs
      );

    if (!response.ok) {
      return null;
    }

    const contentType =
      String(
        response.headers?.get?.("content-type") ||
        ""
      ).toLowerCase();

    if (
      contentType &&
      !contentType.includes("json")
    ) {
      return null;
    }

    const payload =
      await response.json();

    return parseMicrosoftServiceStatusJson(
      payload
    );
  } catch {
    return null;
  }
}

export function parseMicrosoftServiceStatusJson(payload) {
  const objects = [];
  walkObjects(payload, objects);

  const copilotObjects =
    objects.filter((object) =>
      objectMentionsCopilot(object)
    );

  if (!copilotObjects.length) {
    return null;
  }

  const states = [];
  const messages = [];

  for (const object of copilotObjects) {
    const strings =
      collectImmediateStrings(object);

    const statusText =
      firstMatchingString(
        object,
        [
          "status",
          "statusDisplayName",
          "statusDisplay",
          "currentStatus",
          "health",
          "state",
          "severity"
        ]
      ) ||
      strings.join(" ");

    const mapped =
      mapMicrosoftStatus(statusText);

    if (
      mapped.state !== "unknown"
    ) {
      states.push(mapped);
    }

    const message =
      firstMatchingString(
        object,
        [
          "title",
          "message",
          "description",
          "impactDescription",
          "userImpact",
          "currentStatus"
        ]
      );

    if (
      message &&
      !messages.includes(message)
    ) {
      messages.push(message);
    }
  }

  if (!states.length) {
    return null;
  }

  const worst =
    worstState(states);

  return {
    state: worst.state,
    statusLabel: worst.label,
    message:
      messages[0] ||
      (
        worst.state === "operational"
          ? "Microsoft Copilot operational."
          : `Microsoft Copilot: ${worst.label}.`
      ),
    incidentUrl:
      PROVIDER_META.copilot.statusUrl,
    components:
      copilotObjects
        .slice(0, 6)
        .map((object) => ({
          name:
            firstMatchingString(
              object,
              [
                "name",
                "service",
                "serviceName",
                "displayName",
                "title"
              ]
            ) ||
            "Microsoft Copilot",
          status:
            firstMatchingString(
              object,
              [
                "status",
                "currentStatus",
                "health",
                "state",
                "severity"
              ]
            ) ||
            worst.state
        }))
  };
}

export async function probeCopilotService(
  fetchImpl,
  timeoutMs
) {
  const probes = [
    "https://copilot.microsoft.com/",
    "https://copilot.microsoft.com/c/api/user"
  ];

  const results = [];

  for (const url of probes) {
    try {
      const response =
        await fetchWithTimeout(
          fetchImpl,
          url,
          {
            headers: {
              Accept:
                "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
              "User-Agent":
                "Mozilla/5.0 Mini-AI-Encyclopedia-Status/1.2"
            },
            redirect: "follow"
          },
          Math.min(timeoutMs, 5000)
        );

      results.push({
        url,
        status: response.status
      });
    } catch (error) {
      results.push({
        url,
        status: 0,
        error:
          error instanceof Error
            ? error.message
            : "request failed"
      });
    }
  }

  const serverFailure =
    results.find(
      (item) =>
        item.status >= 500
    );

  if (serverFailure) {
    return buildProviderStatus(
      PROVIDER_META.copilot,
      {
        state: "major_outage",
        statusLabel: "Service unreachable",
        message:
          `Copilot endpoint returned HTTP ${serverFailure.status}.`,
        incidentUrl:
          PROVIDER_META.copilot.statusUrl,
        source:
          serverFailure.url,
        sourceType:
          "service-probe",
        components:
          results.map((item) => ({
            name: item.url,
            status:
              item.status ||
              "unreachable"
          }))
      }
    );
  }

  const reachable =
    results.find(
      (item) =>
        item.status >= 200 &&
        item.status < 500
    );

  if (reachable) {
    return buildProviderStatus(
      PROVIDER_META.copilot,
      {
        state: "reachable",
        statusLabel: "Reachable",
        message:
          "Copilot web service is responding. Microsoft did not expose a machine-readable public Copilot health state.",
        incidentUrl:
          PROVIDER_META.copilot.statusUrl,
        source:
          reachable.url,
        sourceType:
          "service-probe",
        components:
          results.map((item) => ({
            name: item.url,
            status:
              item.status ||
              "unreachable"
          }))
      }
    );
  }

  return buildProviderStatus(
    PROVIDER_META.copilot,
    {
      state: "unknown",
      statusLabel: "Status unavailable",
      message:
        "Microsoft's public status API and Copilot reachability probes could not be read.",
      incidentUrl:
        PROVIDER_META.copilot.statusUrl,
      source:
        MICROSOFT_STATUS_API,
      sourceType:
        "service-probe",
      components:
        results.map((item) => ({
          name: item.url,
          status:
            item.status ||
            "unreachable"
        }))
    }
  );
}


/* ------------------------------------------------------------------
 * GROK / xAI
 *
 * xAI's normal status pages may reject server-side scrapers.
 * xAI explicitly publishes /feed.xml for automated status consumption.
 * We use that first.
 *
 * When RSS has no active incident, an unauthenticated API probe confirms that
 * api.x.ai itself is answering. 401/403 are expected auth responses and mean
 * the service endpoint is reachable.
 * ------------------------------------------------------------------ */

export async function checkGrok(fetchImpl, timeoutMs) {
  const rss =
    await tryXaiStatusRss(
      fetchImpl,
      timeoutMs
    );

  if (
    rss &&
    rss.activeIncidents.length
  ) {
    const worst =
      worstState(
        rss.activeIncidents.map(
          (incident) =>
            mapXaiIncidentSeverity(
              `${incident.title} ${incident.description}`
            )
        )
      );

    const incident =
      rss.activeIncidents[0];

    return buildProviderStatus(
      PROVIDER_META.xai,
      {
        state: worst.state,
        statusLabel: worst.label,
        message:
          incident.title ||
          "xAI reports an active incident.",
        incidentUrl:
          incident.link ||
          PROVIDER_META.xai.statusUrl,
        source:
          XAI_STATUS_RSS,
        sourceType:
          "xai-rss",
        components:
          rss.activeIncidents
            .slice(0, 5)
            .map((item) => ({
              name:
                item.title ||
                "xAI incident",
              status:
                worst.state
            }))
      }
    );
  }

  const apiProbe =
    await probeXaiApi(
      fetchImpl,
      timeoutMs
    );

  if (
    rss &&
    !rss.activeIncidents.length &&
    apiProbe.reachable
  ) {
    return buildProviderStatus(
      PROVIDER_META.xai,
      {
        state: "operational",
        statusLabel: "Operational",
        message:
          "No active incident in xAI's official status feed; xAI API is responding.",
        incidentUrl:
          PROVIDER_META.xai.statusUrl,
        source:
          XAI_STATUS_RSS,
        sourceType:
          "xai-rss+api-probe",
        components: [
          {
            name:
              "Official incident feed",
            status:
              "no-active-incident"
          },
          {
            name:
              "api.x.ai",
            status:
              `HTTP ${apiProbe.status}`
          }
        ]
      }
    );
  }

  if (
    rss &&
    !rss.activeIncidents.length
  ) {
    // RSS is the official incident feed. If it is readable and contains no
    // current incident, do not mark Grok red merely because an unauthenticated
    // API probe was blocked by network policy.
    return buildProviderStatus(
      PROVIDER_META.xai,
      {
        state: "operational",
        statusLabel: "Operational",
        message:
          "No active incident reported in xAI's official status feed.",
        incidentUrl:
          PROVIDER_META.xai.statusUrl,
        source:
          XAI_STATUS_RSS,
        sourceType:
          "xai-rss",
        components: [
          {
            name:
              "Official incident feed",
            status:
              "no-active-incident"
          }
        ]
      }
    );
  }

  if (apiProbe.reachable) {
    return buildProviderStatus(
      PROVIDER_META.xai,
      {
        state: "reachable",
        statusLabel: "Reachable",
        message:
          "xAI API is responding, but the official incident feed could not be read.",
        incidentUrl:
          PROVIDER_META.xai.statusUrl,
        source:
          "https://api.x.ai/v1/models",
        sourceType:
          "service-probe",
        components: [
          {
            name: "api.x.ai",
            status:
              `HTTP ${apiProbe.status}`
          }
        ]
      }
    );
  }

  return buildProviderStatus(
    PROVIDER_META.xai,
    {
      state: "unknown",
      statusLabel: "Status unavailable",
      message:
        "xAI's official RSS feed and API reachability probe could not be read.",
      incidentUrl:
        PROVIDER_META.xai.statusUrl,
      source:
        XAI_STATUS_RSS,
      sourceType:
        "xai-rss",
      components: []
    }
  );
}

export async function tryXaiStatusRss(
  fetchImpl,
  timeoutMs
) {
  try {
    const response =
      await fetchWithTimeout(
        fetchImpl,
        XAI_STATUS_RSS,
        {
          headers: {
            Accept:
              "application/rss+xml, application/xml, text/xml, */*;q=0.8",
            "User-Agent":
              "Mini-AI-Encyclopedia-Status/1.2"
          }
        },
        timeoutMs
      );

    if (!response.ok) {
      return null;
    }

    const xml =
      await response.text();

    return parseXaiStatusRss(xml);
  } catch {
    return null;
  }
}

export function parseXaiStatusRss(xml) {
  const raw =
    String(xml || "");

  if (!raw.trim()) {
    return {
      items: [],
      activeIncidents: []
    };
  }

  const itemMatches =
    raw.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) ||
    raw.match(
      /<entry\b[\s\S]*?<\/entry>/gi
    ) ||
    [];

  const items =
    itemMatches
      .map(parseRssItem)
      .filter(Boolean);

  const now =
    Date.now();

  const activeIncidents =
    items.filter((item) => {
      const combined =
        `${item.title} ${item.description}`;

      if (
        /\bresolved\b/i.test(combined) ||
        /\bcompleted\b/i.test(combined)
      ) {
        return false;
      }

      // Old feed entries that predate the current incident window should not
      // stay red forever just because their text lacks the word "Resolved".
      if (item.date) {
        const age =
          now -
          Date.parse(item.date);

        if (
          Number.isFinite(age) &&
          age >
            14 * 24 * 60 * 60 * 1000
        ) {
          return false;
        }
      }

      return (
        /\b(investigating|identified|monitoring|disruption|degraded|outage|unavailable|incident|maintenance)\b/i
          .test(combined)
      );
    });

  return {
    items,
    activeIncidents
  };
}

function parseRssItem(block) {
  const title =
    decodeXml(
      extractXmlValue(
        block,
        "title"
      )
    );

  const description =
    decodeXml(
      extractXmlValue(
        block,
        "description"
      ) ||
      extractXmlValue(
        block,
        "summary"
      ) ||
      extractXmlValue(
        block,
        "content"
      )
    )
      .replace(
        /<[^>]+>/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const link =
    decodeXml(
      extractXmlValue(
        block,
        "link"
      )
    ) ||
    extractLinkHref(
      block
    );

  const date =
    decodeXml(
      extractXmlValue(
        block,
        "pubDate"
      ) ||
      extractXmlValue(
        block,
        "updated"
      ) ||
      extractXmlValue(
        block,
        "published"
      )
    );

  if (
    !title &&
    !description
  ) {
    return null;
  }

  return {
    title,
    description,
    link,
    date
  };
}

export async function probeXaiApi(
  fetchImpl,
  timeoutMs
) {
  const url =
    "https://api.x.ai/v1/models";

  try {
    const response =
      await fetchWithTimeout(
        fetchImpl,
        url,
        {
          headers: {
            Accept:
              "application/json",
            "User-Agent":
              "Mini-AI-Encyclopedia-Status/1.2"
          }
        },
        Math.min(
          timeoutMs,
          5000
        )
      );

    // 401/403 are expected when no xAI API key is supplied.
    // The important signal is that xAI's API edge answered the request.
    return {
      reachable:
        response.status >= 200 &&
        response.status < 500,
      status:
        response.status
    };
  } catch {
    return {
      reachable: false,
      status: 0
    };
  }
}


/* ------------------------------------------------------------------
 * SHARED NORMALIZATION
 * ------------------------------------------------------------------ */

function buildProviderStatus(meta, value) {
  const state =
    value?.state ||
    "unknown";

  const healthy =
    state === "operational" ||
    state === "reachable";

  return {
    id: meta.id,
    label: meta.label,
    company: meta.company,
    state,
    healthy,
    statusLabel:
      value?.statusLabel ||
      (
        healthy
          ? "Operational"
          : "Status unavailable"
      ),
    message:
      value?.message ||
      (
        healthy
          ? "Service responding."
          : "Status could not be confirmed."
      ),
    statusUrl:
      value?.incidentUrl ||
      meta.statusUrl,
    providerStatusUrl:
      meta.statusUrl,
    source:
      value?.source ||
      "",
    sourceType:
      value?.sourceType ||
      "",
    components:
      Array.isArray(value?.components)
        ? value.components
        : []
  };
}

async function safeCheck(check, meta) {
  try {
    return await check();
  } catch (error) {
    return buildProviderStatus(
      meta,
      {
        state: "unknown",
        statusLabel: "Status unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Status check failed.",
        incidentUrl: meta.statusUrl,
        components: []
      }
    );
  }
}

function mapStatuspageIndicator(
  indicator,
  description
) {
  switch (
    String(indicator || "")
      .toLowerCase()
  ) {
    case "none":
      return {
        state: "operational",
        label:
          description ||
          "Operational"
      };
    case "minor":
      return {
        state: "degraded",
        label:
          description ||
          "Degraded performance"
      };
    case "major":
      return {
        state: "partial_outage",
        label:
          description ||
          "Partial outage"
      };
    case "critical":
      return {
        state: "major_outage",
        label:
          description ||
          "Major outage"
      };
    default:
      return {
        state: "unknown",
        label:
          description ||
          "Status unavailable"
      };
  }
}

function mapStatuspageComponent(status) {
  switch (
    String(status || "")
      .toLowerCase()
  ) {
    case "operational":
      return {
        state: "operational",
        label: "Operational"
      };
    case "degraded_performance":
      return {
        state: "degraded",
        label:
          "Degraded performance"
      };
    case "partial_outage":
      return {
        state:
          "partial_outage",
        label:
          "Partial outage"
      };
    case "major_outage":
      return {
        state:
          "major_outage",
        label:
          "Major outage"
      };
    case "under_maintenance":
    case "maintenance":
      return {
        state:
          "maintenance",
        label:
          "Maintenance"
      };
    default:
      return {
        state: "unknown",
        label:
          "Status unavailable"
      };
  }
}

function mapGoogleStatus(
  status,
  severity
) {
  const token =
    String(status || "")
      .toUpperCase();

  if (token === "AVAILABLE") {
    return {
      state:
        "operational",
      label:
        "Operational"
    };
  }

  if (
    token ===
      "SERVICE_OUTAGE" ||
    String(severity || "")
      .toLowerCase() ===
      "high"
  ) {
    return {
      state:
        "major_outage",
      label:
        "Service outage"
    };
  }

  if (
    token ===
      "SERVICE_DISRUPTION"
  ) {
    return {
      state:
        "degraded",
      label:
        "Service disruption"
    };
  }

  if (
    token ===
      "SERVICE_INFORMATION"
  ) {
    return {
      state:
        "degraded",
      label:
        "Service information"
    };
  }

  return {
    state:
      "degraded",
    label:
      "Active incident"
  };
}

export function mapMicrosoftStatus(value) {
  const token =
    String(value || "")
      .toLowerCase();

  if (
    /\b(operational|available|good|healthy|normal service|no issues)\b/i
      .test(token)
  ) {
    return {
      state: "operational",
      label: "Operational"
    };
  }

  if (
    /\b(partial outage|partial_outage)\b/i
      .test(token)
  ) {
    return {
      state:
        "partial_outage",
      label:
        "Partial outage"
    };
  }

  if (
    /\b(critical|major outage|service outage|unavailable|down)\b/i
      .test(token)
  ) {
    return {
      state:
        "major_outage",
      label:
        "Service outage"
    };
  }

  if (
    /\b(maintenance|under maintenance)\b/i
      .test(token)
  ) {
    return {
      state:
        "maintenance",
      label:
        "Maintenance"
    };
  }

  if (
    /\b(service degradation|degraded|warning|issue|incident)\b/i
      .test(token)
  ) {
    return {
      state:
        "degraded",
      label:
        "Service degradation"
    };
  }

  return {
    state: "unknown",
    label:
      "Status unavailable"
  };
}

function mapXaiIncidentSeverity(value) {
  const text =
    String(value || "")
      .toLowerCase();

  if (
    /\b(major outage|outage|unavailable|down)\b/
      .test(text)
  ) {
    return {
      state:
        "major_outage",
      label:
        "Service outage"
    };
  }

  if (
    /\bmaintenance\b/
      .test(text)
  ) {
    return {
      state:
        "maintenance",
      label:
        "Maintenance"
    };
  }

  return {
    state:
      "degraded",
    label:
      "Service disruption"
  };
}

function worstState(states) {
  if (!states.length) {
    return {
      state: "unknown",
      label:
        "Status unavailable"
    };
  }

  return states.reduce(
    (worst, current) => {
      const worstRank =
        STATUS_RANK[
          worst.state
        ] ?? 99;

      const currentRank =
        STATUS_RANK[
          current.state
        ] ?? 99;

      return currentRank >
        worstRank
        ? current
        : worst;
    }
  );
}

function isGeminiIncident(incident) {
  if (
    !incident ||
    typeof incident !==
      "object"
  ) {
    return false;
  }

  if (
    incident.service_key ===
      GEMINI_PRODUCT_ID ||
    String(
      incident.service_name ||
      ""
    ).toLowerCase() ===
      "gemini"
  ) {
    return true;
  }

  return (
    Array.isArray(
      incident.affected_products
    ) &&
    incident.affected_products
      .some(
        (product) =>
          product?.id ===
            GEMINI_PRODUCT_ID ||
          String(
            product?.title ||
            ""
          ).toLowerCase() ===
            "gemini"
      )
  );
}

function isGoogleIncidentActive(incident) {
  if (!incident) {
    return false;
  }

  const latestStatus =
    String(
      incident
        ?.most_recent_update
        ?.status ||
      incident?.updates?.[
        (incident.updates?.length || 1) - 1
      ]?.status ||
      ""
    ).toUpperCase();

  if (
    incident.end ||
    latestStatus ===
      "AVAILABLE"
  ) {
    return false;
  }

  return true;
}

function extractGoogleSummary(value) {
  const text =
    String(value || "")
      .replace(/\*\*/g, "")
      .replace(/#+\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return "";
  }

  const summaryMatch =
    text.match(
      /Summary:?\s*(.*?)(?:Description:|Customer Symptoms:|Symptoms:|Workaround:|$)/i
    );

  const summary =
    summaryMatch?.[1]
      ?.trim() ||
    text;

  return summary.length > 210
    ? `${summary.slice(0, 207).trim()}…`
    : summary;
}

async function fetchWithTimeout(
  fetchImpl,
  url,
  options,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    return await fetchImpl(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

function walkObjects(value, output) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(
      (item) =>
        walkObjects(
          item,
          output
        )
    );

    return;
  }

  output.push(value);

  Object.values(value)
    .forEach(
      (child) =>
        walkObjects(
          child,
          output
        )
    );
}

function objectMentionsCopilot(object) {
  return collectImmediateStrings(object)
    .some(
      (value) =>
        /\b(?:microsoft\s+365\s+)?copilot(?:\s+chat)?\b/i
          .test(value)
    );
}

function collectImmediateStrings(object) {
  return Object.values(
    object || {}
  )
    .filter(
      (value) =>
        typeof value ===
          "string"
    )
    .map(
      (value) =>
        value.trim()
    )
    .filter(Boolean);
}

function firstMatchingString(
  object,
  keys
) {
  for (const key of keys) {
    const exact =
      Object.keys(
        object || {}
      ).find(
        (candidate) =>
          candidate.toLowerCase() ===
          key.toLowerCase()
      );

    if (
      exact &&
      typeof object[exact] ===
        "string" &&
      object[exact].trim()
    ) {
      return object[exact].trim();
    }
  }

  return "";
}

function extractXmlValue(
  block,
  tag
) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    String(block || "")
      .match(
        new RegExp(
          `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
          "i"
        )
      );

  if (!match) {
    return "";
  }

  return String(match[1] || "")
    .replace(
      /^<!\[CDATA\[([\s\S]*?)\]\]>$/,
      "$1"
    )
    .trim();
}

function extractLinkHref(block) {
  const match =
    String(block || "")
      .match(
        /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i
      );

  return match?.[1] || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .trim();
}

function humaniseToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}
