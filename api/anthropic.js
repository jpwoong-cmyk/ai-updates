import {
  fetchAnthropicChangelog,
  ANTHROPIC_CHANGELOG_URL
} from "../scripts/sources/fetch-anthropic.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const items = await fetchAnthropicChangelog();

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );

    return response.status(200).json({
      providerId: "anthropic",
      sourceUrl: ANTHROPIC_CHANGELOG_URL,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      items
    });
  } catch (error) {
    console.error("Anthropic changelog adapter failed:", error);

    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({
      providerId: "anthropic",
      sourceUrl: ANTHROPIC_CHANGELOG_URL,
      itemCount: 0,
      items: [],
      error: error instanceof Error
        ? error.message
        : "Anthropic changelog could not be loaded."
    });
  }
}
