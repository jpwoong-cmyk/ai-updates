const PROVIDER_ALIASES = {
  openai: ["openai", "chatgpt", "gpt"],
  anthropic: ["anthropic", "claude"],
  gemini: ["gemini", "google ai", "google"],
  copilot: ["copilot", "microsoft", "m365"]
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "what", "when", "where",
  "which", "about", "this", "that", "have", "has", "had", "was", "were",
  "are", "how", "does", "did", "can", "could", "would", "should", "tell",
  "show", "give", "latest", "recent", "recently", "new", "updates", "update"
]);

export function detectProviders(question) {
  const q = String(question || "").toLowerCase();

  return Object.entries(PROVIDER_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => q.includes(alias)))
    .map(([providerId]) => providerId);
}

export function detectAudience(question) {
  const q = String(question || "").toLowerCase();

  if (
    q.includes("developer") ||
    q.includes("api") ||
    q.includes("sdk") ||
    q.includes("endpoint") ||
    q.includes("model id") ||
    q.includes("deprecat")
  ) {
    return "developer";
  }

  if (
    q.includes("product") ||
    q.includes("app") ||
    q.includes("chatgpt feature") ||
    q.includes("claude feature")
  ) {
    return "product";
  }

  return "all";
}

export function rankItems(question, items, { limit = 12 } = {}) {
  const q = String(question || "");
  const queryTokens = tokenise(q);
  const providerMatches = new Set(detectProviders(q));
  const wantsRecent = /\b(latest|recent|recently|newest|today|this week|this month)\b/i.test(q);

  const scored = items.map((item) => {
    const title = normalise(item.title);
    const summary = normalise(item.summary);
    const tags = normalise(Array.isArray(item.tags) ? item.tags.join(" ") : item.tags);
    const product = normalise(item.product);
    const providerName = normalise(item.providerName);
    const providerId = normalise(item.providerId);

    let score = 0;

    if (providerMatches.has(item.providerId)) score += 35;

    for (const token of queryTokens) {
      if (title.includes(token)) score += 8;
      if (product.includes(token)) score += 5;
      if (tags.includes(token)) score += 5;
      if (providerName.includes(token) || providerId.includes(token)) score += 5;
      if (summary.includes(token)) score += 2;
    }

    const daysOld = ageInDays(item.date);

    if (wantsRecent && Number.isFinite(daysOld)) {
      score += Math.max(0, 12 - Math.min(12, daysOld / 14));
    }

    return {
      item,
      score,
      dateValue: normaliseDateValue(item.date)
    };
  });

  const meaningful = scored.filter((entry) => entry.score > 0);

  if (!meaningful.length) {
    return scored
      .sort((a, b) => b.dateValue - a.dateValue)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  return meaningful
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.dateValue - a.dateValue;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

function tokenise(value) {
  return normalise(value)
    .split(/[^a-z0-9.+-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function normalise(value) {
  return String(value || "").toLowerCase();
}

function normaliseDateValue(date) {
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
}

function ageInDays(date) {
  const value = Date.parse(date);

  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;

  return Math.max(0, (Date.now() - value) / 86400000);
}
