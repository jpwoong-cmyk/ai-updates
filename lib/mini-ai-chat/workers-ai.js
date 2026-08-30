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

  const selectedModel =
    model ||
    "@cf/meta/llama-3.1-8b-instruct-fp8";

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${encodeURIComponent(accountId)}/ai/run/${selectedModel}`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      max_tokens: 700,
      temperature: 0.35
    })
  });

  const payload = await safeJson(response);

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error ||
      `Workers AI returned HTTP ${response.status}.`;

    throw new Error(message);
  }

  const text =
    payload?.result?.response ||
    payload?.result?.text ||
    "";

  if (!String(text).trim()) {
    throw new Error("Workers AI returned an empty response.");
  }

  return String(text).trim();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
