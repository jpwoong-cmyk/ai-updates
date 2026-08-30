import {
  fetchXaiProductChangelog,
  XAI_PRODUCT_CHANGELOG_URL,
  XAI_PRODUCT_RETRIEVAL_URL
} from "../scripts/sources/fetch-xai.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const items = await fetchXaiProductChangelog();

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=604800"
    );

    return response.status(200).json({
      providerId: "xai",
      audience: "product",
      sourceUrl: XAI_PRODUCT_CHANGELOG_URL,
      retrievalSourceUrl: XAI_PRODUCT_RETRIEVAL_URL,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      items
    });
  } catch (error) {
    console.error("Grok product changelog adapter failed:", error);
    response.setHeader("Cache-Control", "no-store");

    return response.status(502).json({
      providerId: "xai",
      audience: "product",
      sourceUrl: XAI_PRODUCT_CHANGELOG_URL,
      retrievalSourceUrl: XAI_PRODUCT_RETRIEVAL_URL,
      itemCount: 0,
      items: [],
      error:
        error instanceof Error
          ? error.message
          : "Grok product changelog could not be loaded."
    });
  }
}
