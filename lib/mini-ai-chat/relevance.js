const PROVIDERS = [
  {
    id: "openai",
    label: "ChatGPT",
    aliases: ["chatgpt", "openai", "gpt", "gpt-4", "gpt-5"]
  },
  {
    id: "anthropic",
    label: "Claude",
    aliases: ["claude", "anthropic"]
  },
  {
    id: "gemini",
    label: "Gemini",
    aliases: ["gemini", "google ai"]
  },
  {
    id: "copilot",
    label: "Copilot",
    aliases: ["copilot", "microsoft copilot", "m365 copilot"]
  },
  {
    id: "xai",
    label: "Grok",
    aliases: ["grok", "xai", "x.ai"]
  }
];

const AI_DOMAIN_TERMS = [
  "artificial intelligence",
  " ai ",
  "ai model",
  "language model",
  "llm",
  "model",
  "reasoning",
  "chatbot",
  "assistant",
  "developer platform",
  "developer api",
  "api",
  "sdk",
  "endpoint",
  "token",
  "context window",
  "release note",
  "release notes",
  "changelog",
  "deprecation"
];

const UPDATE_TERMS = [
  "latest",
  "recent",
  "recently",
  "new",
  "newest",
  "update",
  "updates",
  "updated",
  "change",
  "changes",
  "changed",
  "release",
  "released",
  "launch",
  "launched",
  "feature",
  "features",
  "model",
  "models",
  "api",
  "developer",
  "sdk",
  "endpoint",
  "deprecated",
  "deprecation",
  "pricing",
  "price",
  "safety",
  "improvement",
  "fixed",
  "bug",
  "available",
  "availability"
];

const QUESTION_PATTERNS = [
  /^(what|when|where|which|why|how)\b/i,
  /\b(tell me|show me|give me|compare|explain|list|find)\b/i,
  /^(did|does|do|is|are|can|could|has|have|was|were|will|would)\b/i,
  /\?$/
];

const SOCIAL_ONLY_PATTERNS = [
  /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening)[!. ]*$/i,
  /^(thanks|thank you|thx|ty)[!. ]*$/i,
  /^(bye|goodbye|see you|cya)[!. ]*$/i,
  /^(i )?(love|like|hate) you[!. ]*$/i,
  /^(how are you|how r u|how's it going|hows it going)[?.! ]*$/i,
  /^(tell me a joke|make me laugh|sing me a song)[?.! ]*$/i,
  /^(test|testing|123|12345|asdf|qwerty)[!. ]*$/i
];

const PROVIDER_SOCIAL_PATTERNS = [
  /\b(i )?(love|like|hate)\b/i,
  /\b(best|favourite|favorite|cute|cool|awesome)\b/i
];

export function classifyChatQuestion(question, history = []) {
  const raw = String(question || "").trim();
  const normalized = normalize(raw);

  if (!normalized) {
    return {
      mode: "reject",
      reason: "empty",
      reply: offTopicReply()
    };
  }

  if (SOCIAL_ONLY_PATTERNS.some((pattern) => pattern.test(raw))) {
    return {
      mode: "reject",
      reason: "social-only",
      reply: offTopicReply()
    };
  }

  const providers = detectProviderMentions(normalized);
  const hasQuestionIntent =
    QUESTION_PATTERNS.some((pattern) => pattern.test(raw.trim()));
  const hasUpdateIntent = includesAny(normalized, UPDATE_TERMS);
  const hasAiDomain = includesAny(withPadding(normalized), AI_DOMAIN_TERMS);

  const context = buildContext(history);
  const contextProviders = detectProviderMentions(context);
  const contextIsRelevant =
    contextProviders.length > 0 ||
    includesAny(withPadding(context), AI_DOMAIN_TERMS) ||
    includesAny(context, UPDATE_TERMS);

  // Provider name by itself, or provider + social chatter, should not spend AI.
  // Examples: "ChatGPT", "I love Claude", "Grok is cool".
  if (
    providers.length > 0 &&
    (
      isProviderOnly(normalized, providers) ||
      (
        PROVIDER_SOCIAL_PATTERNS.some((pattern) => pattern.test(raw)) &&
        !hasUpdateIntent
      )
    )
  ) {
    return {
      mode: "hint",
      reason: "provider-mentioned-without-information-request",
      providerIds: providers.map((provider) => provider.id),
      reply: providerHint(providers)
    };
  }

  // Explicit tracked provider + a genuine information/update request.
  if (
    providers.length > 0 &&
    (
      hasQuestionIntent ||
      hasUpdateIntent ||
      normalized.split(/\s+/).length >= 4
    )
  ) {
    return {
      mode: "allow",
      reason: "tracked-provider-question",
      providerIds: providers.map((provider) => provider.id)
    };
  }

  // Broad encyclopedia questions are allowed without naming a provider.
  // Examples: "What changed recently?", "Any new API deprecations?"
  if (
    hasUpdateIntent &&
    (
      hasQuestionIntent ||
      hasAiDomain ||
      normalized.split(/\s+/).length >= 3
    )
  ) {
    return {
      mode: "allow",
      reason: "broad-update-question",
      providerIds: []
    };
  }

  if (hasAiDomain && hasQuestionIntent) {
    return {
      mode: "allow",
      reason: "ai-domain-question",
      providerIds: []
    };
  }

  // Follow-ups can borrow context from the prior conversation.
  // Example after a ChatGPT question: "What about pricing?"
  if (
    contextIsRelevant &&
    (
      hasQuestionIntent ||
      hasUpdateIntent
    )
  ) {
    return {
      mode: "allow",
      reason: "relevant-follow-up",
      providerIds:
        providers.length
          ? providers.map((provider) => provider.id)
          : contextProviders.map((provider) => provider.id)
    };
  }

  return {
    mode: "reject",
    reason: "off-topic",
    reply: offTopicReply()
  };
}

export function offTopicReply() {
  return (
    "No relevant AI update found. Please try a different question about " +
    "ChatGPT, Claude, Gemini, Copilot or Grok product updates, models, APIs, " +
    "pricing, deprecations or releases."
  );
}

export function noEvidenceReply() {
  return (
    "I couldn't find a relevant result in the indexed AI updates. Try asking " +
    "about a specific provider, product release, model, API change, pricing " +
    "update or deprecation."
  );
}

function providerHint(providers) {
  const labels = providers.map((provider) => provider.label);

  if (labels.length === 1) {
    return (
      `${labels[0]} is tracked in this encyclopedia. ` +
      `Try asking “What’s new with ${labels[0]}?”, ` +
      `“What changed in ${labels[0]} recently?”, or ask about its API, models, ` +
      "pricing or deprecations."
    );
  }

  return (
    `${joinLabels(labels)} are tracked in this encyclopedia. ` +
    "Ask me to compare their recent product, model or developer updates."
  );
}

function detectProviderMentions(value) {
  const text = normalize(value);

  return PROVIDERS.filter((provider) =>
    provider.aliases.some((alias) =>
      containsAlias(text, alias)
    )
  );
}

function containsAlias(text, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
    "i"
  ).test(text);
}

function isProviderOnly(normalized, providers) {
  let remainder = ` ${normalized} `;

  for (const provider of providers) {
    for (const alias of provider.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      remainder = remainder.replace(
        new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "gi"),
        " "
      );
    }
  }

  remainder = remainder
    .replace(/\b(ai|assistant|bot|company|provider)\b/gi, " ")
    .replace(/[?!.,'"()[\]{}:;-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return remainder.length === 0;
}

function buildContext(history) {
  if (!Array.isArray(history)) return "";

  return history
    .slice(-4)
    .map((message) => String(message?.content || ""))
    .join(" ");
}

function includesAny(value, terms) {
  const text = String(value || "").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function withPadding(value) {
  return ` ${String(value || "")} `;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function joinLabels(labels) {
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
