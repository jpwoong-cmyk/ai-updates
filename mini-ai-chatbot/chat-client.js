export async function askMiniAi({ endpoint, question, history, signal }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      history
    }),
    signal
  });

  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || `Chat request failed with HTTP ${response.status}.`);
  }

  return payload;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
