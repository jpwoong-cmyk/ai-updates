
export async function runWorkersAi({
  messages,
  accountId,
  apiToken,
  model,
  fetchImpl = globalThis.fetch
}) {
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is missing.");
  }

  if (!apiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is missing.");
  }

  const selectedModel = model || "@cf/openai/gpt-oss-20b";

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${encodeURIComponent(accountId)}/ai/v1/chat/completions`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      max_tokens: 1200,
      temperature: 0.35
    })
  });

  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error?.message ||
      payload?.error ||
      `Workers AI returned HTTP ${response.status}.`;

    throw new Error(String(message));
  }

  const text = payload?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    throw new Error(
      "Workers AI returned no answer text. " +
      `Finish reason: ${payload?.choices?.[0]?.finish_reason || "unknown"}`
    );
  }

  return text.trim();
}
