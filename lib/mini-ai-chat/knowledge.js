import {
  detectAudience,
  detectProviders,
  rankItems
} from "./ranking.js";

const SOURCES = {
  openai: {
    providerId: "openai",
    providerName: "OpenAI",
    product: "/api/openai",
    developer: "/api/openai-developer"
  },
  anthropic: {
    providerId: "anthropic",
    providerName: "Anthropic",
    product: "/api/anthropic",
    developer: "/api/anthropic-developer"
  },
  gemini: {
    providerId: "gemini",
    providerName: "Google",
    product: "/api/gemini",
    developer: "/api/gemini-developer"
  },
  copilot: {
    providerId: "copilot",
    providerName: "Microsoft",
    product: "/api/copilot",
    developer: "/api/copilot-developer"
  },
  xai: {
    providerId: "xai",
    providerName: "xAI",
    product: "/api/xai",
    developer: "/api/xai-developer"
  }
};

export async function retrieveKnowledge({
  question,
  origin,
  fetchImpl = globalThis.fetch
}) {
  const selectedProviders = detectProviders(question);
  const audience = detectAudience(question);

  const providers =
    selectedProviders.length > 0
      ? selectedProviders
      : Object.keys(SOURCES);

  const endpoints = [];

  for (const providerId of providers) {
    const source = SOURCES[providerId];
    if (!source) continue;

    if (audience === "product") {
      addEndpoint(endpoints, source, providerId, "product", source.product);
      continue;
    }

    if (audience === "developer") {
      addEndpoint(endpoints, source, providerId, "developer", source.developer);
      continue;
    }

    addEndpoint(endpoints, source, providerId, "product", source.product);
    addEndpoint(endpoints, source, providerId, "developer", source.developer);
  }

  const results = await Promise.all(
    endpoints.map((endpoint) =>
      fetchFeed({
        endpoint,
        origin,
        fetchImpl
      })
    )
  );

  const loaded = results.flatMap((result) => result.items);

  const ranked = rankItems(question, loaded, {
    limit: 14
  });

  return ranked.map((item, index) => ({
    ...item,
    reference: index + 1
  }));
}

function addEndpoint(endpoints, source, providerId, audience, path) {
  if (typeof path !== "string" || !path.trim()) {
    return;
  }

  endpoints.push({
    providerId,
    providerName: source.providerName,
    audience,
    path: path.trim()
  });
}

async function fetchFeed({ endpoint, origin, fetchImpl }) {
  const url = new URL(endpoint.path, origin).toString();

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mini-AI-Encyclopedia-Chat/1.2"
      }
    });

    if (!response.ok) {
      return {
        items: [],
        error: `${endpoint.path} returned HTTP ${response.status}`
      };
    }

    const payload = await response.json();

    const items = Array.isArray(payload?.items)
      ? payload.items.map((item) => normaliseItem(item, endpoint, payload))
      : [];

    return { items };
  } catch (error) {
    return {
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "Feed request failed."
    };
  }
}

function normaliseItem(item, endpoint, payload) {
  const sourceUrl =
    safeUrl(item?.sourceUrl) ||
    safeUrl(payload?.sourceUrl) ||
    "";

  return {
    id: String(item?.id || ""),
    providerId: String(item?.providerId || endpoint.providerId),
    providerName: String(item?.providerName || endpoint.providerName),
    audience: endpoint.audience,
    product: String(item?.product || ""),
    title: String(item?.title || "Untitled update"),
    date: String(item?.date || ""),
    summary: truncate(String(item?.summary || ""), 3500),
    tags: Array.isArray(item?.tags) ? item.tags.map(String) : [],
    sourceUrl
  };
}

function truncate(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));

    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}
