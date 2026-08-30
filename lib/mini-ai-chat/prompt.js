export function buildWorkersMessages({ question, history, evidence }) {
  const evidenceText = buildEvidenceBlock(evidence);

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-8)
        .map((message) => ({
          role: message?.role === "assistant" ? "assistant" : "user",
          content: truncate(String(message?.content || ""), 1600)
        }))
        .filter((message) => message.content.trim())
    : [];

  return [
    {
      role: "system",
      content:
        "You are Mini AI, the conversational assistant for Mini AI Encyclopedia. " +
        "The encyclopedia tracks ChatGPT/OpenAI, Claude/Anthropic, Gemini/Google, " +
        "Microsoft Copilot, and Grok/xAI product and developer updates. " +
        "For Grok, product evidence comes from grok.com release notes and developer evidence comes from xAI developer release notes. " +
        "Use the supplied encyclopedia evidence as the factual source of truth for update questions. " +
        "Do not invent releases, dates, features, pricing, availability, or deprecations. " +
        "If evidence is insufficient, say that the indexed updates do not contain enough information. " +
        "When you make a factual claim from evidence, use source markers like [S1] or [S2]. " +
        "Keep the answer clear and conversational. Prefer concise answers unless comparison or detail is requested."
    },
    ...safeHistory,
    {
      role: "user",
      content:
        `CURRENT QUESTION:\n${truncate(question, 1200)}\n\n` +
        `ENCYCLOPEDIA EVIDENCE:\n${evidenceText}`
    }
  ];
}

function buildEvidenceBlock(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) {
    return "No matching encyclopedia entries were retrieved.";
  }

  let total = 0;
  const blocks = [];

  for (const item of evidence) {
    const block = [
      `[S${item.reference}]`,
      `Provider: ${item.providerName || item.providerId}`,
      `Audience: ${item.audience || "unknown"}`,
      `Product: ${item.product || "unknown"}`,
      `Date: ${item.date || "unknown"}`,
      `Title: ${item.title || "Untitled"}`,
      `Tags: ${(item.tags || []).join(", ") || "none"}`,
      `Summary: ${truncate(item.summary || "", 1800)}`,
      `Source: ${item.sourceUrl || "not supplied"}`
    ].join("\n");

    if (total + block.length > 18000) break;

    blocks.push(block);
    total += block.length;
  }

  return blocks.join("\n\n");
}

function truncate(value, max) {
  const text = String(value || "");

  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
