import {
  fetchOpenAIDeveloperChangelog,
  OPENAI_DEVELOPER_CHANGELOG_URL
} from "../scripts/sources/fetch-openai-developer.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const items = await fetchOpenAIDeveloperChangelog();

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );

    return response.status(200).json({
      providerId: "openai",
      audience: "developer",
      sourceUrl: OPENAI_DEVELOPER_CHANGELOG_URL,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      items
    });
  } catch (error) {
    console.error("OpenAI developer changelog adapter failed:", error);
    response.setHeader("Cache-Control", "no-store");

    return response.status(502).json({
      providerId: "openai",
      audience: "developer",
      sourceUrl: OPENAI_DEVELOPER_CHANGELOG_URL,
      itemCount: 0,
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "OpenAI developer changelog could not be loaded."
    });
  }
}
