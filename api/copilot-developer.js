import {
  fetchCopilotDeveloperChangelog,
  COPILOT_DEVELOPER_CHANGELOG_URLS
} from "../scripts/sources/fetch-copilot-developer.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const items = await fetchCopilotDeveloperChangelog();

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );

    return response.status(200).json({
      providerId: "copilot",
      audience: "developer",
      sourceUrl: COPILOT_DEVELOPER_CHANGELOG_URLS[0],
      sourceUrls: COPILOT_DEVELOPER_CHANGELOG_URLS,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      items
    });
  } catch (error) {
    console.error("Copilot developer changelog adapter failed:", error);
    response.setHeader("Cache-Control", "no-store");

    return response.status(502).json({
      providerId: "copilot",
      audience: "developer",
      sourceUrl: COPILOT_DEVELOPER_CHANGELOG_URLS[0],
      sourceUrls: COPILOT_DEVELOPER_CHANGELOG_URLS,
      itemCount: 0,
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "Copilot developer changelog could not be loaded."
    });
  }
}
