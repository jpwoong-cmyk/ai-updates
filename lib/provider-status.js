const STATUS_RANK = {
  operational: 0,
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

export async function getAllProviderStatuses({
  fetchImpl = globalThis.fetch,
  timeoutMs = 6500
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const checkedAt = new Date().toISOString();

  const checks = [
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
  ];

  const providers = await Promise.all(checks);

  return {
    checkedAt,
    healthyCount: providers.filter((item) => item.healthy).length,
    issueCount: providers.filter((item) => !item.healthy).length,
    providers
  };
}

export async function checkOpenAI(fetchImpl, timeoutMs) {
  const url =
    "https://status.openai.com/api/v2/summary.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.0"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`OpenAI status returned HTTP ${response.status}.`);
  }

  const payload = await response.json();

  const pageStatus =
    mapStatuspageIndicator(
      payload?.status?.indicator,
      payload?.status?.description
    );

  const nonOperationalComponents =
    Array.isArray(payload?.components)
      ? payload.components
          .filter((component) =>
            component?.status &&
            component.status !== "operational"
          )
          .slice(0, 5)
      : [];

  const unresolvedIncidents =
    Array.isArray(payload?.incidents)
      ? payload.incidents.filter((incident) =>
          incident &&
          incident.status !== "resolved" &&
          incident.status !== "postmortem"
        )
      : [];

  let state = pageStatus.state;
  let statusLabel = pageStatus.label;
  let message =
    payload?.status?.description ||
    "OpenAI status available.";

  let incidentUrl =
    unresolvedIncidents[0]?.shortlink ||
    PROVIDER_META.openai.statusUrl;

  if (nonOperationalComponents.length) {
    const worstComponent = worstState(
      nonOperationalComponents.map((component) =>
        mapStatuspageComponent(component.status)
      )
    );

    if (
      STATUS_RANK[worstComponent.state] >
      STATUS_RANK[state]
    ) {
      state = worstComponent.state;
      statusLabel = worstComponent.label;
    }

    message =
      nonOperationalComponents
        .map((component) =>
          `${component.name}: ${humaniseToken(component.status)}`
        )
        .join(" · ");
  } else if (unresolvedIncidents.length) {
    message =
      unresolvedIncidents[0]?.name ||
      message;
  }

  return buildProviderStatus(
    PROVIDER_META.openai,
    {
      state,
      statusLabel,
      message,
      incidentUrl,
      source: url,
      components: nonOperationalComponents.map((component) => ({
        name: component.name,
        status: component.status
      }))
    }
  );
}

export async function checkClaude(fetchImpl, timeoutMs) {
  const url =
    "https://status.claude.com/api/v2/summary.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.0"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Claude status returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const components = Array.isArray(payload?.components)
    ? payload.components
    : [];

  // Your encyclopedia tracks both Claude the product and Anthropic's API.
  const relevant = components.filter((component) => {
    const name = String(component?.name || "").toLowerCase();

    return (
      name === "claude.ai" ||
      name.includes("claude api") ||
      name.includes("api.anthropic.com")
    );
  });

  const effectiveComponents =
    relevant.length ? relevant : components;

  const componentStates =
    effectiveComponents.map((component) =>
      mapStatuspageComponent(component.status)
    );

  const worst =
    componentStates.length
      ? worstState(componentStates)
      : mapStatuspageIndicator(
          payload?.status?.indicator,
          payload?.status?.description
        );

  const unhealthy =
    effectiveComponents.filter((component) =>
      component?.status &&
      component.status !== "operational"
    );

  const unresolvedIncidents =
    Array.isArray(payload?.incidents)
      ? payload.incidents.filter((incident) =>
          incident &&
          incident.status !== "resolved" &&
          incident.status !== "postmortem"
        )
      : [];

  const message = unhealthy.length
    ? unhealthy
        .map((component) =>
          `${component.name}: ${humaniseToken(component.status)}`
        )
        .join(" · ")
    : (
      unresolvedIncidents[0]?.name ||
      payload?.status?.description ||
      "Claude services operational."
    );

  return buildProviderStatus(
    PROVIDER_META.anthropic,
    {
      state: worst.state,
      statusLabel: worst.label,
      message,
      incidentUrl:
        unresolvedIncidents[0]?.shortlink ||
        PROVIDER_META.anthropic.statusUrl,
      source: url,
      components: effectiveComponents.map((component) => ({
        name: component.name,
        status: component.status
      }))
    }
  );
}

export async function checkGemini(fetchImpl, timeoutMs) {
  const url =
    "https://www.google.com/appsstatus/dashboard/incidents.json";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Status/1.0"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Google status returned HTTP ${response.status}.`);
  }

  const incidents = await response.json();

  const geminiIncidents =
    Array.isArray(incidents)
      ? incidents.filter((incident) =>
          isGeminiIncident(incident)
        )
      : [];

  const active =
    geminiIncidents.filter((incident) =>
      isGoogleIncidentActive(incident)
    );

  if (!active.length) {
    return buildProviderStatus(
      PROVIDER_META.gemini,
      {
        state: "operational",
        statusLabel: "Operational",
        message: "No active Gemini incidents reported.",
        incidentUrl: PROVIDER_META.gemini.statusUrl,
        source: url,
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
    active.sort((a, b) =>
      Date.parse(b?.modified || b?.created || 0) -
      Date.parse(a?.modified || a?.created || 0)
    )[0];

  const latestStatus =
    String(
      incident?.most_recent_update?.status ||
      incident?.updates?.[incident.updates.length - 1]?.status ||
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
      incidentUrl: incidentId
        ? `https://www.google.com/appsstatus/dashboard/incidents/${encodeURIComponent(incidentId)}`
        : PROVIDER_META.gemini.statusUrl,
      source: url,
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

export async function checkCopilot(fetchImpl, timeoutMs) {
  const officialCandidates = [
    "https://status.cloud.microsoft/",
    "https://msit.status.cloud.microsoft/"
  ];

  let lastError = null;

  for (const url of officialCandidates) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent":
              "Mozilla/5.0 Mini-AI-Encyclopedia-Status/1.0"
          }
        },
        timeoutMs
      );

      if (!response.ok) {
        lastError =
          new Error(`Microsoft status returned HTTP ${response.status}.`);
        continue;
      }

      const html = await response.text();
      const parsed = parseMicrosoftStatusHtml(html);

      if (parsed.state !== "unknown") {
        return buildProviderStatus(
          PROVIDER_META.copilot,
          {
            ...parsed,
            incidentUrl:
              PROVIDER_META.copilot.statusUrl,
            source: url
          }
        );
      }

      lastError =
        new Error("Microsoft public page did not expose a readable Copilot status.");
    } catch (error) {
      lastError = error;
    }
  }

  // Public Microsoft 365 status is deliberately less detailed than tenant
  // Service Health. Return UNKNOWN rather than pretending that Copilot is down.
  throw (
    lastError ||
    new Error("Microsoft public service status unavailable.")
  );
}

export async function checkGrok(fetchImpl, timeoutMs) {
  const url = "https://status.x.ai/";

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 Mini-AI-Encyclopedia-Status/1.0"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`xAI status returned HTTP ${response.status}.`);
  }

  const html = await response.text();
  const parsed = parseXaiStatusHtml(html);

  return buildProviderStatus(
    PROVIDER_META.xai,
    {
      ...parsed,
      incidentUrl: PROVIDER_META.xai.statusUrl,
      source: url
    }
  );
}

export function parseMicrosoftStatusHtml(html) {
  const text = normaliseHtmlText(html);

  if (!text) {
    return unknownStatus(
      "Microsoft status page returned no readable content."
    );
  }

  if (
    /Microsoft Copilot\s+(Operational|Good|Available)/i.test(text)
  ) {
    return {
      state: "operational",
      statusLabel: "Operational",
      message: "Microsoft Copilot operational.",
      components: [
        {
          name: "Microsoft Copilot",
          status: "operational"
        }
      ]
    };
  }

  const directIssue =
    text.match(
      /Microsoft Copilot.{0,100}(Service degradation|Degraded|Warning|Critical|Outage|Unavailable|Issue)/i
    ) ||
    text.match(
      /(Service degradation|Degraded|Warning|Critical|Outage|Unavailable|Issue).{0,100}Microsoft Copilot/i
    );

  if (directIssue) {
    const mapped =
      mapMicrosoftStatus(directIssue[1]);

    return {
      state: mapped.state,
      statusLabel: mapped.label,
      message:
        `Microsoft Copilot: ${mapped.label}.`,
      components: [
        {
          name: "Microsoft Copilot",
          status: mapped.state
        }
      ]
    };
  }

  // Microsoft currently exposes consumer Copilot inside its public
  // "Microsoft consumer products" group. Use that group only if the
  // Copilot-specific string is not server-rendered.
  const consumerSegment =
    sliceAround(
      text,
      /Microsoft consumer products/i,
      700
    );

  if (
    /Operational/i.test(consumerSegment)
  ) {
    return {
      state: "operational",
      statusLabel: "Operational",
      message:
        "Microsoft consumer services operational.",
      components: [
        {
          name: "Microsoft Copilot",
          status: "operational-via-consumer-rollup"
        }
      ]
    };
  }

  if (
    /(Service degradation|Degraded|Warning|Critical|Outage|Unavailable)/i.test(
      consumerSegment
    )
  ) {
    const match =
      consumerSegment.match(
        /(Service degradation|Degraded|Warning|Critical|Outage|Unavailable)/i
      );

    const mapped =
      mapMicrosoftStatus(match?.[1]);

    return {
      state: mapped.state,
      statusLabel: mapped.label,
      message:
        `Microsoft consumer services: ${mapped.label}.`,
      components: [
        {
          name: "Microsoft Copilot",
          status: mapped.state
        }
      ]
    };
  }

  if (
    /All products are operational/i.test(text)
  ) {
    return {
      state: "operational",
      statusLabel: "Operational",
      message:
        "Microsoft public service health reports all products operational.",
      components: [
        {
          name: "Microsoft Copilot",
          status: "operational-via-public-rollup"
        }
      ]
    };
  }

  if (
    /couldn't get the latest status information/i.test(text)
  ) {
    return unknownStatus(
      "Microsoft could not provide its latest public status."
    );
  }

  return unknownStatus(
    "Microsoft public status does not expose enough Copilot detail right now."
  );
}

export function parseXaiStatusHtml(html) {
  const text = normaliseHtmlText(html);

  if (!text) {
    return unknownStatus(
      "xAI status page returned no readable content."
    );
  }

  const targets = [
    "Grok (Web)",
    "API (us-east-1.api.x.ai)",
    "API (us-west-2.api.x.ai)",
    "API (eu-west-1.api.x.ai)"
  ];

  const components = [];

  for (const name of targets) {
    const status =
      readXaiServiceStatus(text, name);

    if (status) {
      components.push({
        name,
        status
      });
    }
  }

  if (!components.length) {
    if (
      /No incidents declared/i.test(text) &&
      /\bavailable\b/i.test(text)
    ) {
      return {
        state: "operational",
        statusLabel: "Operational",
        message:
          "Grok and xAI services available.",
        components: []
      };
    }

    return unknownStatus(
      "xAI status page loaded, but service states could not be read."
    );
  }

  const mapped =
    components.map((component) =>
      mapXaiServiceToken(component.status)
    );

  const worst = worstState(mapped);

  const unhealthy =
    components.filter((component, index) =>
      mapped[index].state !== "operational"
    );

  return {
    state: worst.state,
    statusLabel: worst.label,
    message: unhealthy.length
      ? unhealthy
          .map((component) =>
            `${component.name}: ${humaniseToken(component.status)}`
          )
          .join(" · ")
      : "Grok Web and xAI API regions available.",
    components
  };
}

function readXaiServiceStatus(text, serviceName) {
  const escaped =
    escapeRegExp(serviceName);

  const pattern =
    new RegExp(
      `${escaped}\\s*(available|operational|disruption|degraded|unavailable|outage|maintenance)`,
      "i"
    );

  const match =
    text.match(pattern);

  return match?.[1]
    ? match[1].toLowerCase()
    : "";
}

function mapXaiServiceToken(token) {
  switch (
    String(token || "").toLowerCase()
  ) {
    case "available":
    case "operational":
      return {
        state: "operational",
        label: "Operational"
      };

    case "degraded":
    case "disruption":
      return {
        state: "degraded",
        label: "Service disruption"
      };

    case "maintenance":
      return {
        state: "maintenance",
        label: "Maintenance"
      };

    case "unavailable":
    case "outage":
      return {
        state: "major_outage",
        label: "Service outage"
      };

    default:
      return {
        state: "unknown",
        label: "Status unavailable"
      };
  }
}

function mapStatuspageIndicator(indicator, description) {
  switch (
    String(indicator || "").toLowerCase()
  ) {
    case "none":
      return {
        state: "operational",
        label: description || "Operational"
      };

    case "minor":
      return {
        state: "degraded",
        label: description || "Degraded performance"
      };

    case "major":
      return {
        state: "partial_outage",
        label: description || "Partial outage"
      };

    case "critical":
      return {
        state: "major_outage",
        label: description || "Major outage"
      };

    default:
      return {
        state: "unknown",
        label: description || "Status unavailable"
      };
  }
}

function mapStatuspageComponent(status) {
  switch (
    String(status || "").toLowerCase()
  ) {
    case "operational":
      return {
        state: "operational",
        label: "Operational"
      };

    case "degraded_performance":
      return {
        state: "degraded",
        label: "Degraded performance"
      };

    case "partial_outage":
      return {
        state: "partial_outage",
        label: "Partial outage"
      };

    case "major_outage":
      return {
        state: "major_outage",
        label: "Major outage"
      };

    case "under_maintenance":
    case "maintenance":
      return {
        state: "maintenance",
        label: "Maintenance"
      };

    default:
      return {
        state: "unknown",
        label: "Status unavailable"
      };
  }
}

function mapGoogleStatus(status, severity) {
  const token =
    String(status || "").toUpperCase();

  if (token === "AVAILABLE") {
    return {
      state: "operational",
      label: "Operational"
    };
  }

  if (
    token === "SERVICE_OUTAGE" ||
    String(severity || "").toLowerCase() === "high"
  ) {
    return {
      state: "major_outage",
      label: "Service outage"
    };
  }

  if (token === "SERVICE_DISRUPTION") {
    return {
      state: "degraded",
      label: "Service disruption"
    };
  }

  if (token === "SERVICE_INFORMATION") {
    return {
      state: "degraded",
      label: "Service information"
    };
  }

  return {
    state: "degraded",
    label: "Active incident"
  };
}

function mapMicrosoftStatus(value) {
  const token =
    String(value || "").toLowerCase();

  if (
    token.includes("critical") ||
    token.includes("outage") ||
    token.includes("unavailable")
  ) {
    return {
      state: "major_outage",
      label: "Service outage"
    };
  }

  if (
    token.includes("degradation") ||
    token.includes("degraded") ||
    token.includes("warning") ||
    token.includes("issue")
  ) {
    return {
      state: "degraded",
      label: "Service degradation"
    };
  }

  return {
    state: "unknown",
    label: "Status unavailable"
  };
}

function worstState(states) {
  if (!states.length) {
    return {
      state: "unknown",
      label: "Status unavailable"
    };
  }

  return states.reduce((worst, current) => {
    const worstRank =
      STATUS_RANK[worst.state] ?? 99;

    const currentRank =
      STATUS_RANK[current.state] ?? 99;

    return currentRank > worstRank
      ? current
      : worst;
  });
}

function isGeminiIncident(incident) {
  if (!incident || typeof incident !== "object") {
    return false;
  }

  if (
    incident.service_key === GEMINI_PRODUCT_ID ||
    String(incident.service_name || "").toLowerCase() === "gemini"
  ) {
    return true;
  }

  return Array.isArray(incident.affected_products) &&
    incident.affected_products.some((product) =>
      product?.id === GEMINI_PRODUCT_ID ||
      String(product?.title || "").toLowerCase() === "gemini"
    );
}

function isGoogleIncidentActive(incident) {
  if (!incident) {
    return false;
  }

  const latestStatus =
    String(
      incident?.most_recent_update?.status ||
      incident?.updates?.[incident.updates?.length - 1]?.status ||
      ""
    ).toUpperCase();

  if (
    incident.end ||
    latestStatus === "AVAILABLE"
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
    summaryMatch?.[1]?.trim() ||
    text;

  return summary.length > 210
    ? `${summary.slice(0, 207).trim()}…`
    : summary;
}

function buildProviderStatus(meta, value) {
  const state =
    value?.state || "unknown";

  const healthy =
    state === "operational";

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
          ? "Operational."
          : "Status could not be confirmed."
      ),
    statusUrl:
      value?.incidentUrl ||
      meta.statusUrl,
    providerStatusUrl:
      meta.statusUrl,
    source:
      value?.source || "",
    components:
      Array.isArray(value?.components)
        ? value.components
        : []
  };
}

function unknownStatus(message) {
  return {
    state: "unknown",
    statusLabel: "Status unavailable",
    message,
    components: []
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
        incidentUrl:
          meta.statusUrl,
        components: []
      }
    );
  }
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
      () => controller.abort(),
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

function normaliseHtmlText(html) {
  return decodeEntities(
    String(html || "")
      .replace(
        /<script\b[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<svg\b[\s\S]*?<\/svg>/gi,
        " "
      )
      .replace(
        /<br\s*\/?>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function humaniseToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function sliceAround(text, pattern, radius) {
  const match =
    text.match(pattern);

  if (!match || match.index == null) {
    return "";
  }

  return text.slice(
    Math.max(0, match.index - radius),
    Math.min(
      text.length,
      match.index + match[0].length + radius
    )
  );
}

function escapeRegExp(value) {
  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}
