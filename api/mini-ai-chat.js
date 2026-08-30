import { retrieveKnowledge } from "../lib/mini-ai-chat/knowledge.js";
import { buildWorkersMessages } from "../lib/mini-ai-chat/prompt.js";
import { runWorkersAi } from "../lib/mini-ai-chat/workers-ai.js";

export default async function handler(request, response) {
  if (request.method === "GET") {
    response.setHeader("Cache-Control", "no-store");

    return response.status(200).json({
      service: "mini-ai-chat",
      status: "ready",
      workersAiConfigured: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.CLOUDFLARE_API_TOKEN
      )
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");

    return response.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const question = String(request.body?.question || "").trim();

    if (!question) {
      return response.status(400).json({
        error: "Question is required."
      });
    }

    if (question.length > 1200) {
      return response.status(400).json({
        error: "Question is too long."
      });
    }

    const history = cleanHistory(request.body?.history);
    const origin = resolveKnowledgeOrigin(request);

    const evidence = await retrieveKnowledge({
      question,
      origin
    });

    const messages = buildWorkersMessages({
      question,
      history,
      evidence
    });

    const reply = await runWorkersAi({
      messages,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      model: process.env.CLOUDFLARE_MODEL
    });

    const sources = evidence
      .filter((item) => item.sourceUrl)
      .slice(0, 8)
      .map((item) => ({
        reference: item.reference,
        providerId: item.providerId,
        providerName: item.providerName,
        audience: item.audience,
        title: item.title,
        date: item.date,
        sourceUrl: item.sourceUrl,
        label:
          `[S${item.reference}] ` +
          `${item.providerName || item.providerId}` +
          (item.date ? ` · ${item.date}` : "")
      }));

    response.setHeader("Cache-Control", "no-store");

    return response.status(200).json({
      reply,
      sources,
      evidenceCount: evidence.length
    });
  } catch (error) {
    console.error("Mini AI chatbot failed:", error);

    response.setHeader("Cache-Control", "no-store");

    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Mini AI chatbot request failed."
    });
  }
}

function resolveKnowledgeOrigin(request) {
  if (process.env.MINI_AI_KNOWLEDGE_ORIGIN) {
    return ensureTrailingSlash(process.env.MINI_AI_KNOWLEDGE_ORIGIN);
  }

  const forwardedHost =
    request.headers["x-forwarded-host"] ||
    request.headers.host;

  const forwardedProto =
    request.headers["x-forwarded-proto"] ||
    "https";

  if (!forwardedHost) {
    throw new Error(
      "Could not determine the encyclopedia origin. Set MINI_AI_KNOWLEDGE_ORIGIN in Vercel."
    );
  }

  return ensureTrailingSlash(
    `${forwardedProto}://${forwardedHost}`
  );
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-8)
    .map((message) => ({
      role:
        message?.role === "assistant"
          ? "assistant"
          : "user",
      content: String(message?.content || "").slice(0, 1600)
    }))
    .filter((message) => message.content.trim());
}

function ensureTrailingSlash(value) {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MINI_AI_KNOWLEDGE_ORIGIN must use HTTP or HTTPS.");
  }

  return url.toString().endsWith("/")
    ? url.toString()
    : `${url.toString()}/`;
}
